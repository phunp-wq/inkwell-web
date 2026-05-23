const express = require('express');
const path = require('path');
const { existsSync } = require('fs');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { Pool } = require('pg');
const { spawn } = require('child_process');
const { Meilisearch } = require('meilisearch');
const PYTHON = process.env.PYTHON_PATH || 'python3';
const TRAFILATURA_SCRIPT = path.join(__dirname, 'trafilatura_extract.py');

const app = express();
const PORT = process.env.PORT || 3777;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'nvidia/nemotron-3-nano-30b-a3b:free';
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

// Substack reader/queue URLs yêu cầu login → resolve về canonical.
// Special case duy nhất; mọi redirect khác Jina tự handle.
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
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Accept':        'application/json',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Jina ${res.status}`);

  const json    = await res.json();
  const data    = json.data || json;
  const content = data.content || '';

  if (!content || content.split(/\s+/).length < 50) {
    throw new Error('Jina returned insufficient content');
  }

  return {
    content,
    title:     data.title || new URL(url).hostname,
    siteName:  new URL(url).hostname,
    byline:    data.author || '',
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

// Incremental extractor for the "summary" string field inside a streaming JSON object.
// Feed chunks via .push(chunk) → it returns any newly-revealed summary characters (unescaped).
function makeSummaryStreamer() {
  let buf = '';
  let state = 'searching'; // searching → inside → done
  let escape = false;
  return {
    push(chunk) {
      buf += chunk;
      let out = '';
      if (state === 'searching') {
        const m = buf.match(/"summary"\s*:\s*"/);
        if (!m) return '';
        buf = buf.slice(m.index + m[0].length);
        state = 'inside';
      }
      if (state === 'inside') {
        let i = 0;
        while (i < buf.length) {
          const c = buf[i];
          if (escape) {
            // handle simple JSON escapes
            if (c === 'n') out += '\n';
            else if (c === 't') out += '\t';
            else if (c === 'r') out += '\r';
            else if (c === '"') out += '"';
            else if (c === '\\') out += '\\';
            else if (c === '/') out += '/';
            else out += c;
            escape = false;
            i++;
          } else if (c === '\\') {
            escape = true;
            i++;
          } else if (c === '"') {
            state = 'done';
            buf = buf.slice(i + 1);
            return out;
          } else {
            out += c;
            i++;
          }
        }
        buf = '';
      }
      return out;
    },
  };
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

// ─── Meilisearch ──────────────────────────────────────────────────────────────
const MEILI_HOST = process.env.MEILI_HOST || 'http://127.0.0.1:7700';
const MEILI_KEY  = process.env.MEILI_MASTER_KEY || '';

const meili = new Meilisearch({ host: MEILI_HOST, apiKey: MEILI_KEY });
const articlesIndex = meili.index('articles');

function removeDiacritics(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function toMeiliDoc(r) {
  const tags = Array.isArray(r.tags) ? r.tags : safeJson(r.tags, []);
  return {
    id:          r.id,
    url:         r.url,
    title:       r.title || '',
    title_nd:    removeDiacritics(r.title),
    summary:     r.summary || '',
    summary_nd:  removeDiacritics(r.summary),
    content:     r.content || '',
    content_nd:  removeDiacritics(r.content),
    tags,
    category:    r.category || 'Other',
    site_name:   r.site_name || '',
    saved_at:    Number(r.saved_at) || Date.now(),
  };
}

// Wait until Meilisearch sidecar accepts connections (boot can take 1-3s).
async function waitForMeili(maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await meili.health();
      return true;
    } catch (_) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Meilisearch never became healthy');
}

async function setupMeilisearch() {
  await waitForMeili();
  // Ensure the index exists before settings/stats calls (creating is idempotent).
  try { await meili.createIndex('articles', { primaryKey: 'id' }); } catch (_) {}
  await articlesIndex.updateSettings({
    searchableAttributes: [
      'title', 'title_nd',
      'summary', 'summary_nd',
      'tags',
    ],
    filterableAttributes: ['category', 'tags', 'site_name'],
    sortableAttributes:   ['saved_at'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
    },
  });

  // Bootstrap: if index is empty but DB has articles, bulk-import.
  // Idempotent — safe to run on every container start.
  try {
    const stats = await articlesIndex.getStats();
    if (stats.numberOfDocuments === 0) {
      const { rows } = await pool.query(
        'SELECT id,url,title,summary,content,tags,site_name,saved_at,category FROM articles WHERE ai_processed=1'
      );
      if (rows.length > 0) {
        const task = await articlesIndex.addDocuments(rows.map(toMeiliDoc));
        // Wait for the indexing task so a quick test query right after boot works.
        await meili.tasks.waitForTask(task.taskUid, { timeOutMs: 30000 });
        console.log(`[Inkwell] Bootstrapped Meili with ${rows.length} articles from DB`);
      }
    } else {
      console.log(`[Inkwell] Meili already has ${stats.numberOfDocuments} docs, skipping bootstrap`);
    }
  } catch (e) {
    console.warn('[Inkwell] Meili bootstrap skipped:', e.message);
  }

  console.log('[Inkwell] Meilisearch index ready');
}

// Sync a single article (best-effort — log on fail, don't throw).
async function syncArticleToMeili(articleId) {
  try {
    const { rows } = await pool.query(
      'SELECT id,url,title,summary,content,tags,site_name,saved_at,category FROM articles WHERE id=$1 AND ai_processed=1',
      [articleId]
    );
    if (rows[0]) await articlesIndex.addDocuments([toMeiliDoc(rows[0])]);
  } catch (e) {
    console.warn('[Inkwell] Meili sync fail:', e.message);
  }
}

// ─── Pipeline helpers (shared by blocking + streaming endpoints) ─────────────

async function extractAndSave(url) {
  const id = crypto.randomUUID();
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
  return { id, ...extractResult };
}

function buildAiPrompts(title, content, url) {
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
    ? `Tiêu đề: "${title}"\nNguồn: ${url}\n\nNội dung:\n${content.slice(0, 12000)}`
    : `Article title: "${title}"\nSource: ${url}\n\nContent:\n${content.slice(0, 12000)}`;
  return { systemPrompt, userPrompt, lang };
}

async function runAI(extractResult, url, onSummaryChunk) {
  const { title, content } = extractResult;
  const { systemPrompt, userPrompt, lang } = buildAiPrompts(title, content, url);

  const body = {
    model: AI_MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: `/no_think\n${systemPrompt}` },
      { role: 'user', content: userPrompt },
    ],
  };

  if (!onSummaryChunk) {
    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const aiJson = await aiRes.json();
    if (!aiJson.choices?.[0]) throw new Error(`OpenRouter error: ${JSON.stringify(aiJson)}`);
    return { parsed: parseJsonOutput(aiJson.choices[0].message.content), lang };
  }

  // Streaming branch
  const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!aiRes.ok || !aiRes.body) {
    const errText = await aiRes.text().catch(() => '');
    throw new Error(`OpenRouter error: ${aiRes.status} ${errText}`);
  }

  const reader = aiRes.body.getReader();
  const decoder = new TextDecoder();
  const streamer = makeSummaryStreamer();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          const chunk = streamer.push(delta);
          if (chunk) onSummaryChunk(chunk);
        }
      } catch (_) {}
    }
  }

  return { parsed: parseJsonOutput(fullText), lang };
}

app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Optional bearer auth — only enforced if INKWELL_API_TOKEN is set.
// Webapp (same-origin) is exempt; only /api/* checked.
const INKWELL_API_TOKEN = process.env.INKWELL_API_TOKEN || '';
if (INKWELL_API_TOKEN) {
  app.use('/api', (req, res, next) => {
    // Allow same-origin requests from the webapp (no Origin header or same host).
    const origin = req.headers.origin;
    if (!origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`) {
      return next();
    }
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${INKWELL_API_TOKEN}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  });
}

// ─── Models ───────────────────────────────────────────────────────────────────
app.get('/api/models', (_, res) => {
  res.json([{ name: AI_MODEL, family: 'openrouter' }]);
});

// ─── Full pipeline: extract → AI → PostgreSQL ────────────────────────────────
app.post('/api/pipeline', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  const { rows: existing } = await pool.query('SELECT id, ai_processed FROM articles WHERE url=$1', [url]);
  if (existing[0]) {
    if (existing[0].ai_processed) {
      return res.status(409).json({ error: 'Article already saved', id: existing[0].id });
    }
    // Incomplete row from a prior failed attempt — drop it and re-process.
    await pool.query('DELETE FROM articles WHERE id=$1', [existing[0].id]);
  }

  let articleId = null;
  try {
    const extractResult = await extractAndSave(url);
    articleId = extractResult.id;
    const { parsed, lang } = await runAI(extractResult, url);
    await pool.query(
      `UPDATE articles SET summary=$1,tags=$2,category=$3,ai_processed=1 WHERE id=$4`,
      [parsed.summary, JSON.stringify(parsed.tags), parsed.category, articleId]
    );
    await syncArticleToMeili(articleId);
    res.json({
      id: articleId, url,
      title: extractResult.title,
      siteName: extractResult.siteName,
      wordCount: extractResult.wordCount,
      lang,
      extractionSource: extractResult.source || 'unknown',
      ai: { summary: parsed.summary, tags: parsed.tags, category: parsed.category }
    });
  } catch (e) {
    if (articleId) await pool.query('DELETE FROM articles WHERE id=$1', [articleId]);
    res.status(500).json({ error: e.message });
  }
});

// ─── Streaming pipeline (SSE) — for Chrome extension popup ───────────────────
app.post('/api/pipeline/stream', async (req, res) => {
  const { url } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  if (!url) {
    send('error', { message: 'url required' });
    return res.end();
  }

  try {
    const { rows: existing } = await pool.query('SELECT id, ai_processed FROM articles WHERE url=$1', [url]);
    if (existing[0]) {
      if (existing[0].ai_processed) {
        send('error', { code: 'already_saved', id: existing[0].id, message: 'Article already saved' });
        return res.end();
      }
      await pool.query('DELETE FROM articles WHERE id=$1', [existing[0].id]);
    }
  } catch (e) {
    send('error', { message: e.message });
    return res.end();
  }

  let articleId = null;
  try {
    send('start', { url });
    const extractResult = await extractAndSave(url);
    articleId = extractResult.id;
    send('extracted', {
      id: articleId,
      title: extractResult.title,
      siteName: extractResult.siteName,
      byline: extractResult.byline,
      wordCount: extractResult.wordCount,
    });
    send('ai_start', {});

    const { parsed, lang } = await runAI(extractResult, url, (chunk) => {
      send('summary_chunk', { text: chunk });
    });

    await pool.query(
      `UPDATE articles SET summary=$1,tags=$2,category=$3,ai_processed=1 WHERE id=$4`,
      [parsed.summary, JSON.stringify(parsed.tags), parsed.category, articleId]
    );
    await syncArticleToMeili(articleId);

    send('done', {
      id: articleId,
      url,
      title: extractResult.title,
      summary: parsed.summary,
      tags: parsed.tags,
      category: parsed.category,
      lang,
    });
    res.end();
  } catch (e) {
    if (articleId) await pool.query('DELETE FROM articles WHERE id=$1', [articleId]);
    send('error', { message: e.message });
    res.end();
  }
});

// ─── Recent articles (Chrome extension idle list) ────────────────────────────
app.get('/api/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 3, 10);
  const { rows } = await pool.query(
    `SELECT id, title, url, category, saved_at FROM articles
     WHERE ai_processed=1 ORDER BY saved_at DESC LIMIT $1`,
    [limit]
  );
  res.json(rows);
});

// ─── List / search articles ───────────────────────────────────────────────────
app.get('/api/articles', async (req, res) => {
  const { q, category, tag } = req.query;

  let ids = null;
  if (q && q.trim()) {
    try {
      const result = await articlesIndex.search(q.trim(), { limit: 100, attributesToRetrieve: ['id'] });
      ids = new Set(result.hits.map(h => h.id));
      if (ids.size === 0) return res.json([]);
    } catch (e) {
      console.warn('[Inkwell] Meili search fail:', e.message);
      return res.json([]);
    }
  }

  const { rows } = await pool.query(
    'SELECT id,url,title,summary,tags,category,site_name,byline,word_count,saved_at,ai_processed FROM articles ORDER BY saved_at DESC'
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
  await articlesIndex.deleteDocument(req.params.id).catch(e =>
    console.warn('[Inkwell] Meili delete fail:', e.message)
  );
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
  .then(() => {
    // Meilisearch boot is best-effort — server still serves DB-only endpoints if it fails.
    setupMeilisearch().catch(err => console.error('[Inkwell] Meilisearch setup failed:', err.message));
    app.listen(PORT, () => console.log(`[Inkwell] Server running on http://localhost:${PORT}`));
  })
  .catch(err => { console.error('[Inkwell] Startup error:', err); process.exit(1); });
