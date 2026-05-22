const express = require('express');
const path = require('path');
const { existsSync } = require('fs');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const MiniSearch = require('minisearch');
const PYTHON = process.env.PYTHON_PATH || 'python3';
const TRAFILATURA_SCRIPT = path.join(__dirname, 'trafilatura_extract.py');

const app = express();
const PORT = process.env.PORT || 3777;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-oss-120b:free';
const JINA_API_KEY = process.env.JINA_API_KEY || '';

// ─── PostgreSQL init ──────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS articles (
    id          TEXT PRIMARY KEY,
    url         TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    summary     TEXT,
    tags        TEXT,
    category    TEXT,
    site_name   TEXT,
    byline      TEXT,
    word_count  INTEGER,
    saved_at    BIGINT NOT NULL,
    ai_processed INTEGER DEFAULT 0
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS favorites (
    article_id TEXT PRIMARY KEY,
    saved_at   BIGINT NOT NULL
  )`);
}

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}

const JINA_REMOVE_SELECTORS = [
  'nav', 'footer', 'header', 'aside',
  '[class*="sidebar"]', '[class*="related"]',
  '[class*="subscribe"]', '[class*="newsletter"]',
  '[class*="comment"]', '[class*="discussion"]',
  '[class*="top-post"]', '[class*="popular"]',
  '.ads', '.advertisement', '.cookie-banner', '.cookie-notice',
  '[class*="social-share"]', '[id*="disqus"]',
  '.subscription-widget-wrap', '.post-footer', '.post-ufi',
  '[data-testid="storyReadMore"]', '.pw-responses',
].join(', ');

async function resolveSubstackUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'substack.com' && u.pathname.startsWith('/home/post/p-')) {
      const postId = u.pathname.split('/').pop().split('?')[0];
      const res = await fetch(`https://substack.com/api/v1/posts/by-id/${postId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.canonical_url || url;
      }
    }
  } catch (_) {}
  return url;
}

async function extractViaJina(rawUrl) {
  if (!JINA_API_KEY) throw new Error('No Jina API key');

  const url = await resolveSubstackUrl(rawUrl);

  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: {
      'Authorization':     `Bearer ${JINA_API_KEY}`,
      'Accept':            'application/json',
      'X-Engine':          'browser',
      'X-Return-Format':   'markdown',
      'X-Respond-With':    'readerlm-v2',
      'X-Target-Selector': 'article, main, [role="main"], .post-content, .entry-content, .article-content, .available-content',
      'X-Remove-Selector': JINA_REMOVE_SELECTORS,
      'X-Retain-Images':   'none',
      'X-Timeout':         '30',
    },
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) throw new Error(`Jina ${res.status}`);

  const json    = await res.json();
  const content = json.data?.content || json.content || '';
  const title   = json.data?.title   || json.title   || '';

  if (!content || content.split(/\s+/).length < 50) {
    throw new Error('Jina returned insufficient content');
  }

  return {
    content,
    title:     title || new URL(url).hostname,
    siteName:  new URL(url).hostname,
    byline:    json.data?.author || '',
    wordCount: content.split(/\s+/).length,
    source:    'jina',
  };
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
      'Cache-Control': 'no-cache'
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
  return r.text();
}

async function extractContent(html, url) {
  // Fallback 1: Trafilatura
  try {
    const result = await new Promise((resolve, reject) => {
      const py = spawn(PYTHON, [TRAFILATURA_SCRIPT, url]);
      const chunks = [];
      py.stdout.on('data', d => chunks.push(d));
      py.stdin.write(html);
      py.stdin.end();
      py.on('close', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8').trim());
          if (parsed.success && parsed.text && parsed.wordCount > 50) resolve(parsed);
          else reject(new Error(parsed.error || 'extraction failed'));
        } catch (e) { reject(e); }
      });
      py.on('error', reject);
    });
    return {
      content:   result.text,
      title:     result.title    || new URL(url).hostname,
      siteName:  result.sitename || new URL(url).hostname,
      byline:    result.author   || '',
      wordCount: result.wordCount,
      source:    'trafilatura',
    };
  } catch (_) {}

  // Fallback 2: Readability.js
  const dom     = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article) throw new Error('Could not extract article — page may require JS or login');
  const content = article.textContent.trim();
  return {
    content,
    title:     article.title    || 'Untitled',
    siteName:  article.siteName || new URL(url).hostname,
    byline:    article.byline   || '',
    wordCount: content.split(/\s+/).length,
    source:    'readability',
  };
}

function detectLanguage(text) {
  const viet = /[àáâãèéêìíòóôõùúăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/gi;
  return (text.slice(0, 3000).match(viet) || []).length > 3 ? 'Vietnamese' : 'English';
}

function parseJsonOutput(text) {
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { summary: '', tags: [], category: 'Other' };
  const p = safeJson(jsonMatch[0], null);
  if (!p) return { summary: '', tags: [], category: 'Other' };
  const VALID = ['Design', 'Development', 'Product', 'AI-ML', 'Business', 'Research', 'Science', 'Other'];
  return {
    summary: typeof p.summary === 'string' ? p.summary : '',
    category: VALID.includes(p.category) ? p.category : 'Other',
    tags: Array.isArray(p.tags) ? p.tags.filter(t => typeof t === 'string').slice(0, 5) : []
  };
}

// ─── MiniSearch index ─────────────────────────────────────────────────────────
const miniSearch = new MiniSearch({
  fields: ['title', 'summary', 'content', 'tags'],
  storeFields: ['id', 'url', 'title', 'summary', 'site_name', 'word_count', 'category', 'tags'],
  searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 3, summary: 2, tags: 2 } }
});

async function rebuildIndex() {
  const { rows } = await pool.query(
    'SELECT id,url,title,summary,content,tags,site_name,word_count,category FROM articles WHERE ai_processed=1'
  );
  if (miniSearch.documentCount > 0) miniSearch.removeAll();
  rows.forEach(r => miniSearch.add({ ...r, tags: safeJson(r.tags, []).join(' ') }));
}

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Models ───────────────────────────────────────────────────────────────────
app.get('/api/models', (_, res) => {
  res.json([{ name: AI_MODEL, family: 'openrouter' }]);
});

// ─── Full pipeline: extract → AI → PostgreSQL ────────────────────────────────
app.post('/api/pipeline', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const { rows: existing } = await pool.query('SELECT id FROM articles WHERE url=$1', [url]);
  if (existing[0]) return res.status(409).json({ error: 'Article already saved', id: existing[0].id });

  const id = crypto.randomUUID();
  let articleSaved = false;

  try {
    let extractResult;
    try {
      extractResult = await extractViaJina(url);
    } catch (jinaErr) {
      console.warn('[Inkwell] Jina failed, using HTML fallback:', jinaErr.message);
      const html = await fetchHtml(url);
      extractResult = await extractContent(html, url);
    }
    const { content, title, siteName, byline, wordCount } = extractResult;

    await pool.query(
      `INSERT INTO articles (id,url,title,content,site_name,byline,word_count,saved_at,ai_processed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)`,
      [id, url, title, content, siteName, byline, wordCount, Date.now()]
    );
    articleSaved = true;

    const lang = detectLanguage(content);
    const isVi = lang === 'Vietnamese';

    const systemPrompt = isVi
      ? `Bạn là trợ lý AI phân tích bài báo.
Xuất ra DUY NHẤT một JSON object hợp lệ — không markdown, không code fence, không giải thích, không văn bản ngoài JSON.

Cấu trúc JSON bắt buộc:
{
  "title": "tiêu đề đã làm sạch",
  "language": "vi",
  "summary": "tóm tắt 5-6 câu bằng tiếng Việt",
  "category": "một trong: Design / Development / Product / AI-ML / Business / Research / Science / Other",
  "tags": ["tag1", "tag2", "tag3"]
}
Quy tắc: tags 3-5 mục · category PHẢI khớp chính xác một giá trị trong danh sách.`
      : `You are an AI assistant that analyzes articles.
Output ONLY a single valid JSON object — no markdown, no code fences, no explanation, no text outside the JSON.

Required JSON structure:
{
  "title": "cleaned article title",
  "language": "en",
  "summary": "5-6 sentence summary in English",
  "category": "one of: Design / Development / Product / AI-ML / Business / Research / Science / Other",
  "tags": ["tag1", "tag2", "tag3"]
}
Rules: tags 3-5 items · category MUST match exactly one listed value.`;

    const userPrompt = isVi
      ? `Tiêu đề: "${title}"
Nguồn: ${url}

Nội dung:
${content.slice(0, 12000)}`
      : `Article title: "${title}"
Source: ${url}

Content:
${content.slice(0, 12000)}`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        reasoning: { effort: 'low' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiJson.choices?.[0]) throw new Error(`OpenRouter error: ${JSON.stringify(aiJson)}`);
    const parsed = parseJsonOutput(aiJson.choices[0].message.content);

    await pool.query(
      `UPDATE articles SET summary=$1,tags=$2,category=$3,ai_processed=1 WHERE id=$4`,
      [parsed.summary, JSON.stringify(parsed.tags), parsed.category, id]
    );

    await rebuildIndex();

    res.json({
      id, url, title, siteName, wordCount, lang,
      extractionSource: extractResult.source || 'unknown',
      ai: { summary: parsed.summary, tags: parsed.tags, category: parsed.category }
    });
  } catch (e) {
    if (!articleSaved) await pool.query('DELETE FROM articles WHERE id=$1', [id]);
    res.status(500).json({ error: e.message });
  }
});

// ─── List / search articles ───────────────────────────────────────────────────
app.get('/api/articles', async (req, res) => {
  const { q, category, tag } = req.query;

  let ids = null;
  if (q && q.trim()) {
    const results = miniSearch.search(q.trim(), { limit: 100 });
    ids = new Set(results.map(r => r.id));
    if (ids.size === 0) return res.json([]);
  }

  const { rows } = await pool.query(
    'SELECT id,url,title,summary,tags,category,site_name,word_count,saved_at,ai_processed FROM articles ORDER BY saved_at DESC'
  );
  const { rows: favRows } = await pool.query('SELECT article_id FROM favorites');
  const favIds = new Set(favRows.map(r => r.article_id));

  let filtered = rows.map(r => ({ ...r, tags: safeJson(r.tags, []), favorite: favIds.has(r.id) }));
  if (ids) filtered = filtered.filter(r => ids.has(r.id));
  if (category) filtered = filtered.filter(r => r.category === category);
  if (tag) filtered = filtered.filter(r => r.tags.includes(tag));

  res.json(filtered);
});

// ─── Get single article (with full content) ───────────────────────────────────
app.get('/api/articles/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM articles WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const row = rows[0];
  const { rows: favRows } = await pool.query('SELECT 1 FROM favorites WHERE article_id=$1', [row.id]);
  res.json({ ...row, tags: safeJson(row.tags, []), favorite: favRows.length > 0 });
});

// ─── Delete article ───────────────────────────────────────────────────────────
app.delete('/api/articles/:id', async (req, res) => {
  await pool.query('DELETE FROM articles WHERE id=$1', [req.params.id]);
  await pool.query('DELETE FROM favorites WHERE article_id=$1', [req.params.id]);
  await rebuildIndex();
  res.json({ ok: true });
});

// ─── Toggle favorite ──────────────────────────────────────────────────────────
app.post('/api/articles/:id/favorite', async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT 1 FROM favorites WHERE article_id=$1', [id]);
  if (rows.length > 0) {
    await pool.query('DELETE FROM favorites WHERE article_id=$1', [id]);
    res.json({ favorite: false });
  } else {
    await pool.query('INSERT INTO favorites (article_id, saved_at) VALUES ($1,$2)', [id, Date.now()]);
    res.json({ favorite: true });
  }
});

// ─── Serve React frontend ─────────────────────────────────────────────────────
const DIST = path.join(__dirname, 'dist');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

initDb()
  .then(() => rebuildIndex())
  .then(() => app.listen(PORT, () => console.log(`[Inkwell] Server running on http://localhost:${PORT}`)))
  .catch(err => { console.error('[Inkwell] Startup error:', err); process.exit(1); });
