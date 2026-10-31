// Read a public company web page (team, about, leadership, careers) as plain text,
// plus the links on it that probably lead to people pages.
// GET /api/page?url=https://example.com/about
// Returns { url, title, text, peopleLinks: [{ text, url }] }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const PEOPLE = /(team|about|leadership|people|founders|management|who-we-are|our-story|company|careers|board)/i;

function safeUrl(raw) {
  let u;
  try { u = new URL(raw.startsWith('http') ? raw : 'https://' + raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname;
  // No local or private network targets.
  if (/^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith('.internal') || h.endsWith('.local') || !h.includes('.')) return null;
  return u;
}

export default async function handler(req, res) {
  const u = safeUrl(String(req.query.url || ''));
  if (!u) return res.status(400).json({ error: 'Give a public http(s) address.' });
  try {
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    const html = (await r.text()).slice(0, 800000);
    const title = ((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).replace(/\s+/g, ' ').trim();
    const links = [];
    const seen = new Set();
    for (const m of html.matchAll(/<a[^>]+href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      let href; try { href = new URL(m[1], r.url || u).href; } catch (e) { continue; }
      const text = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (new URL(href).hostname !== new URL(r.url || u).hostname) continue;
      if (!(PEOPLE.test(href) || PEOPLE.test(text)) || seen.has(href)) continue;
      seen.add(href); links.push({ text, url: href });
      if (links.length >= 12) break;
    }
    // Keep alt text and aria labels: team pages often put names only in image alts.
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<img[^>]*alt="([^"]{2,80})"[^>]*>/gi, ' [img: $1] ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 14000);
    res.status(200).json({ url: r.url || u.href, title, text, peopleLinks: links });
  } catch (e) {
    res.status(200).json({ url: u.href, title: '', text: '', peopleLinks: [], error: 'Could not read that page.' });
  }
}
