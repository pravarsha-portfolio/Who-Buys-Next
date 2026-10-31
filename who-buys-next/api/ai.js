// One door to several AI providers. Keys come from the visitor (sent per request, never stored)
// or from the server's environment variables.
// POST /api/ai  { provider, key?, model?, prompt }  ->  { text, provider, model }
//
// Free options: GEMINI_API_KEY (Google AI Studio free tier) or GROQ_API_KEY (free tier).
// Paid: ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY.

const ENV = {
  claude: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY'
};
const DEFAULT_MODEL = {
  claude: 'claude-sonnet-5-5', gemini: 'gemini-flash-latest', openai: 'gpt-4.1-mini',
  groq: 'llama-3.3-70b-versatile', openrouter: 'anthropic/claude-sonnet-4.5'
};
const SYSTEM = 'You are a careful B2B sales research analyst. You only state facts found in the evidence you are given. When asked for JSON you reply with JSON only, no prose and no code fences.';

export function pickProvider(want) {
  if (want && (process.env[ENV[want]])) return want;
  return Object.keys(ENV).find(p => process.env[ENV[p]]) || null;
}

async function call(provider, key, model, prompt) {
  const t = AbortSignal.timeout(110000);
  if (provider === 'claude') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: t,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 6000, system: SYSTEM, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'Claude error ' + r.status);
    return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  }
  if (provider === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', signal: t, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: 'application/json' } })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'Gemini error ' + r.status);
    return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  }
  const base = { openai: 'https://api.openai.com/v1', groq: 'https://api.groq.com/openai/v1', openrouter: 'https://openrouter.ai/api/v1' }[provider];
  if (!base) throw new Error('Unknown provider');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST', signal: t,
    headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || provider + ' error ' + r.status);
  return j.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const prompt = String(b.prompt || '').slice(0, 180000);
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  let provider = b.provider, key = String(b.key || '').trim();
  if (!key) { provider = pickProvider(provider); key = provider ? process.env[ENV[provider]] : ''; }
  if (!provider || !key) return res.status(400).json({ error: 'No AI key. Add one in Settings, or set GEMINI_API_KEY / ANTHROPIC_API_KEY on the server.' });
  const FALLBACK = { claude: 'claude-sonnet-4-5', gemini: 'gemini-2.5-flash' };
  let model = b.model || DEFAULT_MODEL[provider];
  try {
    let text;
    try { text = await call(provider, key, model, prompt); }
    catch (e) {
      if (b.model || !FALLBACK[provider] || !/not found|not_found|404|does not exist|unsupported/i.test(String(e.message))) throw e;
      model = FALLBACK[provider]; text = await call(provider, key, model, prompt);
    }
    res.status(200).json({ text, provider, model });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
