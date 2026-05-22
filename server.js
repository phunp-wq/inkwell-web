const express = require('express');
const path = require('path');
const { existsSync } = require('fs');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const Database = require('better-sqlite3');
const { spawn } = require('child_process');
const MiniSearch = require('minisearch');
const PYTHON = process.env.PYTHON_PATH || 'python3';
const TRAFILATURA_SCRIPT = path.join(__dirname, 'trafilatura_extract.py');

const app = express();
const PORT = process.env.PORT || 3777;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'qwen/qwen-2.5-72b-instruct';

// ─── SQLite init ──────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'inkwell.db'));
db.exec(`CREATE TABLE IF NOT EXISTS articles (
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
  saved_at    INTEGER NOT NULL,
  ai_processed INTEGER DEFAULT 0
)`);

db.exec(`CREATE TABLE IF NOT EXISTS favorites (
  article_id TEXT PRIMARY KEY,
  saved_at   INTEGER NOT NULL
)`);

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
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
  try {
    const trafilatura = await new Promise((resolve, reject) => {
      const py = spawn(PYTHON, [TRAFILATURA_SCRIPT, url]);
      const chunks = [];
      py.stdout.on('data', d => chunks.push(d));
      py.stdin.write(html);
      py.stdin.end();
      py.on('close', () => {
        try {
          const out = Buffer.concat(chunks).toString('utf8').trim();
          const parsed = JSON.parse(out);
          if (parsed.success && parsed.text && parsed.wordCount > 50) resolve(parsed);
          else reject(new Error(parsed.error || 'extraction failed'));
        } catch (e) { reject(e); }
      });
      py.on('error', reject);
    });
    return {
      content: trafilatura.text,
      title: trafilatura.title || new URL(url).hostname,
      siteName: trafilatura.sitename || new URL(url).hostname,
      byline: trafilatura.author || '',
      wordCount: trafilatura.wordCount,
    };
  } catch (_) {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) throw new Error('Could not extract article — page may require JS or login');
    const content = article.textContent.trim();
    return {
      content,
      title: article.title || 'Untitled',
      siteName: article.siteName || new URL(url).hostname,
      byline: article.byline || '',
      wordCount: content.split(/\s+/).length,
    };
  }
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

function rebuildIndex() {
  const rows = db.prepare('SELECT id,url,title,summary,content,tags,site_name,word_count,category FROM articles WHERE ai_processed=1').all();
  if (miniSearch.documentCount > 0) miniSearch.removeAll();
  rows.forEach(r => miniSearch.add({ ...r, tags: safeJson(r.tags, []).join(' ') }));
}
rebuildIndex();

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

// ─── Full pipeline: extract → Gemini → SQLite ─────────────────────────────────
app.post('/api/pipeline', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const existing = db.prepare('SELECT id FROM articles WHERE url=?').get(url);
  if (existing) return res.status(409).json({ error: 'Article already saved', id: existing.id });

  const id = crypto.randomUUID();
  let articleSaved = false;

  try {
    const html = await fetchHtml(url);
    const { content, title, siteName, byline, wordCount } = await extractContent(html, url);

    db.prepare(`INSERT INTO articles (id,url,title,content,site_name,byline,word_count,saved_at,ai_processed)
                VALUES (?,?,?,?,?,?,?,?,0)`)
      .run(id, url, title, content, siteName, byline, wordCount, Date.now());
    articleSaved = true;

    const lang = detectLanguage(content);
    const isVi = lang === 'Vietnamese';

    const prompt = isVi
      ? `Bạn là trợ lý AI phân tích bài báo.
Chỉ xuất ra một JSON object hợp lệ duy nhất — không markdown, không giải thích.

Tiêu đề: "${title}"
Nguồn: ${url}

Nội dung:
${content.slice(0, 12000)}

---
Trả về đúng cấu trúc JSON này:
{
  "title": "tiêu đề đã làm sạch",
  "language": "vi",
  "summary": "tóm tắt 5-6 câu bằng tiếng Việt",
  "category": "một trong: Design / Development / Product / AI-ML / Business / Research / Science / Other",
  "tags": ["tag1", "tag2", "tag3"]
}
Quy tắc: tags 3-5 mục · category PHẢI khớp chính xác · không có văn bản ngoài JSON`
      : `You are an AI assistant that analyzes articles.
Output ONLY a single valid JSON object — no markdown, no code fences, no explanation.

Article title: "${title}"
Source: ${url}

Content:
${content.slice(0, 12000)}

---
Return this exact JSON structure:
{
  "title": "cleaned article title",
  "language": "en",
  "summary": "5-6 sentence summary in English",
  "category": "one of: Design / Development / Product / AI-ML / Business / Research / Science / Other",
  "tags": ["tag1", "tag2", "tag3"]
}
Rules: tags 3-5 items · category MUST match listed values · no text outside JSON`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const aiJson = await aiRes.json();
    if (!aiJson.choices?.[0]) throw new Error(`OpenRouter error: ${JSON.stringify(aiJson)}`);
    const parsed = parseJsonOutput(aiJson.choices[0].message.content);

    db.prepare(`UPDATE articles SET summary=?,tags=?,category=?,ai_processed=1 WHERE id=?`)
      .run(parsed.summary, JSON.stringify(parsed.tags), parsed.category, id);

    rebuildIndex();

    res.json({
      id, url, title, siteName, wordCount, lang,
      ai: { summary: parsed.summary, tags: parsed.tags, category: parsed.category }
    });
  } catch (e) {
    if (!articleSaved) db.prepare('DELETE FROM articles WHERE id=?').run(id);
    res.status(500).json({ error: e.message });
  }
});

// ─── List / search articles ───────────────────────────────────────────────────
app.get('/api/articles', (req, res) => {
  const { q, category, tag } = req.query;

  let ids = null;
  if (q && q.trim()) {
    const results = miniSearch.search(q.trim(), { limit: 100 });
    ids = new Set(results.map(r => r.id));
    if (ids.size === 0) return res.json([]);
  }

  const rows = db.prepare('SELECT id,url,title,summary,tags,category,site_name,word_count,saved_at,ai_processed FROM articles ORDER BY saved_at DESC').all();
  const favIds = new Set(db.prepare('SELECT article_id FROM favorites').all().map(r => r.article_id));

  let filtered = rows.map(r => ({ ...r, tags: safeJson(r.tags, []), favorite: favIds.has(r.id) }));
  if (ids) filtered = filtered.filter(r => ids.has(r.id));
  if (category) filtered = filtered.filter(r => r.category === category);
  if (tag) filtered = filtered.filter(r => r.tags.includes(tag));

  res.json(filtered);
});

// ─── Get single article (with full content) ───────────────────────────────────
app.get('/api/articles/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM articles WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const fav = db.prepare('SELECT 1 FROM favorites WHERE article_id=?').get(row.id);
  res.json({ ...row, tags: JSON.parse(row.tags || '[]'), favorite: !!fav });
});

// ─── Delete article ───────────────────────────────────────────────────────────
app.delete('/api/articles/:id', (req, res) => {
  db.prepare('DELETE FROM articles WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM favorites WHERE article_id=?').run(req.params.id);
  rebuildIndex();
  res.json({ ok: true });
});

// ─── Toggle favorite ──────────────────────────────────────────────────────────
app.post('/api/articles/:id/favorite', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT 1 FROM favorites WHERE article_id=?').get(id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE article_id=?').run(id);
    res.json({ favorite: false });
  } else {
    db.prepare('INSERT INTO favorites (article_id, saved_at) VALUES (?,?)').run(id, Date.now());
    res.json({ favorite: true });
  }
});

// ─── Serve React frontend ─────────────────────────────────────────────────────
const DIST = path.join(__dirname, 'public');
if (existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`[Inkwell] Server running on http://localhost:${PORT}`);
});
