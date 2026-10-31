// Search the web through the AI provider's own search tool, using your API key.
// More reliable than free scraping, which search engines often block from cloud servers.
// POST /api/websearch { q, src, provider?, key? }  ->  { results: [{ title, url, content, date, source, src }] }
// Claude: web search tool. Gemini: Google Search grounding.

const HINT = {
  jobs: 'current job postings (company career pages, Greenhouse, Lever, Ashby, Workable, LinkedIn Jobs)',
  reviews: 'user reviews and complaints (G2, Capterra, TrustRadius, Reddit)',
  reddit: 'recent Reddit threads and comments',
  hn: 'Hacker News discussions',
  news: 'news articles from the last 12 months',
  events: 'upcoming or recent conferences, workshops and talks',
  github: 'GitHub repositories',
  tenders: 'government or institutional tenders, RFPs and procurement notices (GeM, eProcure, TED, SAM.gov)',
  posts: 'LinkedIn posts, Medium or Substack articles',
  linkedin: 'public LinkedIn profiles of people',
  web: 'web pages'
};

const ENVK = { claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };

async function viaClaude(key, model, q, hint) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: `Search for ${hint} matching: ${q}\nPrefer items from the last 12 months. After searching, list each relevant result on its own line as: title | url | date (YYYY-MM-DD or unknown) | one-sentence summary.` }]
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'Claude search error ' + r.status);
  const out = [], seen = new Set();
  const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  // Lines Claude wrote, matched to URLs the search tool actually returned.
  const real = new Map();
  for (const c of j.content || []) {
    if (c.type !== 'web_search_tool_result' || !Array.isArray(c.content)) continue;
    for (const it of c.content) if (it.url) real.set(it.url, it);
  }
  for (const line of text.split('\n')) {
    const p = line.split('|').map(s => s.replace(/^[\s\-*\d.]+/, '').trim());
    if (p.length < 2) continue;
    const url = (p[1].match(/https?:\/\/\S+/) || [])[0];
    if (!url || !real.has(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: p[0] || real.get(url).title, url, date: /\d{4}-\d{2}-\d{2}/.test(p[2] || '') ? p[2] : '', content: p.slice(3).join(' ') || real.get(url).title, source: host(url) });
  }
  for (const [url, it] of real) if (!seen.has(url) && out.length < 12) {
    seen.add(url); out.push({ title: it.title || host(url), url, date: '', content: it.page_age ? `Published ${it.page_age}. ${it.title}` : it.title, source: host(url) });
  }
  return out;
}

async function viaGemini(key, model, q, hint) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST', signal: AbortSignal.timeout(90000), headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Search Google for ${hint} matching: ${q}\nPrefer items from the last 12 months. For every relevant result, write one line: organisation name | what happened, in one sentence | date (YYYY-MM-DD or unknown) | page title. List up to 10.` }] }],
      tools: [{ google_search: {} }]
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'Gemini search error ' + r.status);
  const cand = j.candidates?.[0] || {};
  const meta = cand.groundingMetadata || {};
  const chunks = meta.groundingChunks || [];
  const supports = meta.groundingSupports || [];
  return chunks.filter(c => c.web?.uri).map((c, i) => {
    const said = supports.filter(s => (s.groundingChunkIndices || []).includes(i)).map(s => s.segment?.text).filter(Boolean).join(' ');
    const date = (said.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
    return { title: said.split('|')[0].trim().slice(0, 90) || c.web.title || 'Result', url: c.web.uri, date, content: said.slice(0, 600) || c.web.title, source: c.web.title || 'Google' };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const q = String(b.q || '').slice(0, 300), src = String(b.src || 'web');
  if (!q) return res.status(400).json({ results: [] });
  let provider = b.provider, key = String(b.key || '').trim();
  if (!key || !ENVK[provider]) {
    provider = ['claude', 'gemini'].find(p => process.env[ENVK[p]]);
    key = provider ? process.env[ENVK[provider]] : '';
  }
  if (!provider || !key) return res.status(400).json({ results: [], error: 'Web search through AI needs a Claude or Gemini key.' });
  const models = b.model ? [b.model] : provider === 'claude' ? ['claude-sonnet-5-5', 'claude-sonnet-4-5'] : ['gemini-flash-latest', 'gemini-2.5-flash'];
  try {
    let results, lastErr;
    for (const model of models) {
      try { results = provider === 'claude' ? await viaClaude(key, model, q, HINT[src] || HINT.web) : await viaGemini(key, model, q, HINT[src] || HINT.web); break; }
      catch (e) { lastErr = e; if (!/not found|not_found|404|does not exist|unsupported/i.test(String(e.message))) throw e; }
    }
    if (!results) throw lastErr;
    res.status(200).json({ results: results.map(r => ({ ...r, src })) });
  } catch (e) {
    res.status(502).json({ results: [], error: String(e.message || e) });
  }
}
