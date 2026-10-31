// Multi-source, keyless search for buying signals.
// GET /api/search?q=<query>&src=<news|web|jobs|reviews|reddit|hn|github|tenders|linkedin|events>
// Returns { results: [{ title, url, content, date, source, src }] }
// Each source is a place a ResearchMind buyer leaves a trail. Sources that fail return [] so one
// broken site never kills a run.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const unesc = s => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const strip = s => unesc(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const get = (u, h = {}) => fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...h }, signal: AbortSignal.timeout(9000) });

// Site scopes that turn a general web search into a specific signal source.
const SCOPES = {
  jobs: '(site:job-boards.greenhouse.io OR site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:apply.workable.com OR site:wellfound.com)',
  reviews: '(site:g2.com OR site:capterra.com OR site:trustradius.com OR site:producthunt.com)',
  tenders: '(site:gem.gov.in OR site:eprocure.gov.in OR site:ted.europa.eu OR site:sam.gov OR site:contractsfinder.service.gov.uk OR "request for proposal" OR RFP)',
  linkedin: 'site:linkedin.com/in',
  posts: '(site:linkedin.com/posts OR site:medium.com OR site:substack.com)',
  events: '(site:rosenfeldmedia.com OR site:researchops.community OR site:uxindia.org OR site:meetup.com OR site:lu.ma OR conference OR summit OR talk)'
};

async function gnews(q, n = 10) {
  const u = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:1y') + '&hl=en-IN&gl=IN&ceid=IN:en';
  const t = await (await get(u)).text();
  return [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, n).map(m => {
    const g = tag => (m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [, ''])[1];
    const title = strip(g('title')), src = strip(g('source'));
    const d = new Date(g('pubDate'));
    return { title, url: unesc(g('link')), content: `${src}. ${title}`, date: isNaN(d) ? '' : d.toISOString().slice(0, 10), source: src || 'Google News' };
  });
}

async function bing(q, n = 8) {
  const t = await (await get('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en&cc=in&count=15')).text();
  const out = [];
  for (const blk of t.match(/<li class="b_algo"[\s\S]*?<\/li>/g) || []) {
    const m = blk.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    let url = unesc(m[1]);
    if (url.includes('bing.com/ck/a')) {
      const uu = new URL(url).searchParams.get('u') || '';
      if (uu.startsWith('a1')) { try { url = Buffer.from(uu.slice(2).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(); } catch (e) {} }
    }
    const sn = blk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const content = sn ? strip(sn[1]) : '';
    const dm = content.match(/^(\w{3} \d{1,2}, \d{4})|^(\d{1,2} \w{3} \d{4})/);
    const d = dm ? new Date(dm[0] + ' UTC') : null;
    out.push({ title: strip(m[2]), url, content, date: d && !isNaN(d) ? d.toISOString().slice(0, 10) : '', source: hostOf(url) });
    if (out.length >= n) break;
  }
  return out;
}

async function ddg(q, n = 8) {
  const t = await (await get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q))).text();
  const out = [];
  for (const blk of t.split('class="result__body"').slice(1)) {
    const a = blk.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = unesc(a[1]);
    const uddg = url.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    const sn = blk.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    out.push({ title: strip(a[2]), url, content: sn ? strip(sn[1]) : '', date: '', source: hostOf(url) });
    if (out.length >= n) break;
  }
  return out;
}

async function reddit(q, n = 10) {
  const r = await get('https://www.reddit.com/search.json?sort=new&t=year&limit=25&q=' + encodeURIComponent(q), { Accept: 'application/json' });
  const j = await r.json();
  return (j?.data?.children || []).slice(0, n).map(c => c.data).map(d => ({
    title: d.title, url: 'https://www.reddit.com' + d.permalink,
    content: `r/${d.subreddit} · u/${d.author} · ${d.num_comments} comments. ${String(d.selftext || '').slice(0, 500)}`,
    date: new Date(d.created_utc * 1000).toISOString().slice(0, 10), source: 'r/' + d.subreddit
  }));
}

async function hn(q, n = 8) {
  const since = Math.floor(Date.now() / 1000) - 365 * 86400;
  const j = await (await get(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&numericFilters=created_at_i>${since}&hitsPerPage=${n}`)).json();
  return (j.hits || []).map(h => ({
    title: h.title || h.story_title || (h.comment_text ? strip(h.comment_text).slice(0, 90) : 'HN item'),
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    content: strip(h.comment_text || h.story_text || '').slice(0, 500) + ` (by ${h.author})`,
    date: (h.created_at || '').slice(0, 10), source: 'Hacker News'
  }));
}

async function github(q, n = 8) {
  const since = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  const h = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) h.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const j = await (await get(`https://api.github.com/search/repositories?sort=updated&per_page=${n}&q=${encodeURIComponent(q + ' pushed:>' + since)}`, h)).json();
  return (j.items || []).map(r => ({
    title: r.full_name + (r.description ? ' — ' + r.description : ''), url: r.html_url,
    content: `Owner: ${r.owner?.login} (${r.owner?.type}). ${r.description || ''} ★${r.stargazers_count}`,
    date: (r.pushed_at || '').slice(0, 10), source: 'GitHub'
  }));
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
async function webAny(q, n) {
  const a = await bing(q, n).catch(() => []);
  if (a.length >= 3) return a;
  const b = await ddg(q, n).catch(() => []);
  return [...a, ...b];
}

const RUN = {
  news: q => gnews(q),
  web: q => webAny(q, 8),
  jobs: q => webAny(`${q} ${SCOPES.jobs}`, 10),
  reviews: q => webAny(`${q} ${SCOPES.reviews}`, 8),
  tenders: async q => [...await gnews(q + ' tender OR RFP').catch(() => []), ...await webAny(`${q} ${SCOPES.tenders}`, 6)],
  linkedin: q => webAny(`${SCOPES.linkedin} ${q}`, 10),
  posts: q => webAny(`${q} ${SCOPES.posts}`, 8),
  events: q => webAny(`${q} ${SCOPES.events}`, 8),
  reddit: q => reddit(q).catch(() => webAny(`site:reddit.com ${q}`, 8)),
  hn: q => hn(q),
  github: q => github(q)
};

export default async function handler(req, res) {
  const q = String(req.query.q || '').slice(0, 300).trim();
  const src = String(req.query.src || 'web');
  if (!q) return res.status(400).json({ results: [], error: 'Missing q' });
  const fn = RUN[src] || RUN.web;
  let results = [];
  try { results = await fn(q); } catch (e) { results = []; }
  const seen = new Set();
  results = results.filter(r => r.url && r.title && !seen.has(r.url) && seen.add(r.url)).map(r => ({ ...r, src }));
  res.setHeader('Cache-Control', 's-maxage=1800');
  res.status(200).json({ results });
}
