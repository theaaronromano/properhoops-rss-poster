const fetch = require('node-fetch');
const RSSParser = require('rss-parser');
const cheerio = require('cheerio');
const GhostAdminAPI = require('@tryghost/admin-api');
const http = require('http');

// ─── Config ────────────────────────────────────────────────────────────────
const GHOST_URL = process.env.GHOST_URL || 'https://www.properhoops.au';
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY || '69c3503c0eefc50001bae904:bcefcb5444e460031f30fcbfb0d943324c99bfa207aa5d3afb51d61a708821c5';
const POLL_MINUTES = parseInt(process.env.POLL_MINUTES || '30');
const DRY_RUN = process.env.DRY_RUN === 'true';

// ─── Ghost client ──────────────────────────────────────────────────────────
const ghost = new GhostAdminAPI({ url: GHOST_URL, key: GHOST_ADMIN_KEY, version: 'v5.0' });
const parser = new RSSParser({ timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProperHoopsBot/1.0)' } });

// ─── Sources ───────────────────────────────────────────────────────────────
const SOURCES = [
    // ── RSS feeds (reliable) ──────────────────────────────────────────────
    {
        id: 'highposthoops',
        source: 'High Post Hoops',
        tag: 'WNBA',
        type: 'rss',
        url: 'https://highposthoops.com/feed'
    },
    {
        id: 'apnews-ncaaw',
        source: 'AP News',
        tag: 'NCAA Basketball',
        type: 'rss',
        url: 'https://rsshub.app/apnews/topics/womens-college-basketball',
        customHeaders: { 'Accept': 'application/rss+xml, application/xml, text/xml' }
    },

    // ── Scrapers ──────────────────────────────────────────────────────────
    {
        id: 'foxsports-au',
        source: 'Fox Sports AU',
        tag: 'Basketball',
        type: 'scrape',
        url: 'https://www.foxsports.com.au/basketball/latest-news',
        baseUrl: 'https://www.foxsports.com.au',
        selectors: {
            articles: 'article, [class*="article"], [class*="story-block"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'basketball-au',
        source: 'Basketball Australia',
        tag: 'Basketball Australia',
        type: 'scrape',
        url: 'https://www.basketball.com.au/',
        baseUrl: 'https://www.basketball.com.au',
        selectors: {
            articles: 'article, [class*="news"], [class*="card"], [class*="post"], [class*="item"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'fos-basketball',
        source: 'Front Office Sports',
        tag: 'Basketball',
        type: 'scrape',
        url: 'https://frontofficesports.com/tag/basketball/',
        baseUrl: 'https://frontofficesports.com',
        selectors: {
            articles: 'article, [class*="post-card"], [class*="article"], [class*="story"]',
            title: 'h2, h3, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'wnbl',
        source: 'WNBL',
        tag: 'WNBL',
        type: 'scrape',
        url: 'https://www.wnbl.com.au/news',
        baseUrl: 'https://www.wnbl.com.au',
        selectors: {
            articles: 'article, [class*="news-card"], [class*="article"], [class*="card"]',
            title: 'h2, h3, [class*="title"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'unrivaled',
        source: 'Unrivaled',
        tag: 'Unrivaled',
        type: 'scrape',
        url: 'https://www.unrivaled.basketball/news',
        baseUrl: 'https://www.unrivaled.basketball',
        selectors: {
            articles: 'article, [class*="news"], [class*="post"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'bleacher-unrivaled',
        source: 'Bleacher Report',
        tag: 'Unrivaled',
        type: 'scrape',
        url: 'https://bleacherreport.com/unrivaled',
        baseUrl: 'https://bleacherreport.com',
        selectors: {
            articles: 'article, [class*="atom"], [class*="card"], [class*="article"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'big3',
        source: 'BIG3',
        tag: 'BIG3',
        type: 'scrape',
        url: 'https://big3.com/news/',
        baseUrl: 'https://big3.com',
        selectors: {
            articles: 'article, [class*="news"], [class*="post"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'fiba',
        source: 'FIBA',
        tag: 'FIBA',
        type: 'scrape',
        url: 'https://www.fiba.basketball/en/news',
        baseUrl: 'https://www.fiba.basketball',
        selectors: {
            articles: 'article, [class*="news"], [class*="article"]',
            title: 'h2, h3, h4, [class*="title"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'euroleague',
        source: 'EuroLeague',
        tag: 'EuroLeague',
        type: 'scrape',
        url: 'https://www.euroleaguebasketball.net/euroleague/news/',
        baseUrl: 'https://www.euroleaguebasketball.net',
        delay: 5000,
        selectors: {
            articles: 'article, [class*="news"], [class*="card"], [class*="article"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'codesports-nbl',
        source: 'Code Sports',
        tag: 'NBL',
        type: 'scrape',
        url: 'https://www.codesports.com.au/basketball/nbl',
        baseUrl: 'https://www.codesports.com.au',
        selectors: {
            articles: 'article, [class*="article"], [class*="story"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'sportingnews-ncaa',
        source: 'Sporting News',
        tag: 'NCAA Basketball',
        type: 'scrape',
        url: 'https://www.sportingnews.com/us/ncaa-basketball/news',
        baseUrl: 'https://www.sportingnews.com',
        selectors: {
            articles: 'article, [class*="article"], [class*="story"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img'
        }
    },
    {
        id: 'australia-basketball',
        source: 'Australia Basketball',
        tag: 'Basketball Australia',
        type: 'scrape',
        url: 'https://www.australia.basketball/news',
        baseUrl: 'https://www.australia.basketball',
        selectors: {
            articles: 'article, [class*="news"], [class*="article"], [class*="card"], [class*="post"]',
            title: 'h2, h3, h4, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img'
        }
    }
];

// ─── Duplicate check via Ghost ─────────────────────────────────────────────
let postedUrls = new Set();

async function loadPostedUrls() {
    try {
        console.log('Loading existing posts from Ghost...');
        let page = 1, hasMore = true;
        while (hasMore) {
            const posts = await ghost.posts.browse({ limit: 100, page, fields: 'id,twitter_description', filter: 'tag:Auto-Posted' });
            posts.forEach(p => { if (p.twitter_description) postedUrls.add(p.twitter_description); });
            hasMore = posts.meta && posts.meta.pagination && page < posts.meta.pagination.pages;
            page++;
        }
        console.log(`Loaded ${postedUrls.size} already-posted URLs`);
    } catch (e) {
        console.error('Could not load existing posts:', e.message);
    }
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────
async function fetchRSS(source) {
    try {
        const feed = await parser.parseURL(source.url);
        return feed.items.slice(0, 20).map(item => ({
            title: (item.title || '').trim(),
            url: item.link,
            summary: (item.contentSnippet || '').slice(0, 300),
            image: extractRSSImage(item),
            source: source.source,
            tag: source.tag
        })).filter(i => i.title && i.url);
    } catch (e) {
        console.error(`[${source.id}] RSS error:`, e.message);
        return [];
    }
}

function extractRSSImage(item) {
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) return item['media:content']['$'].url;
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) return item['media:thumbnail']['$'].url;
    if (item.content) { const m = item.content.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) return m[1]; }
    return null;
}

async function fetchScrape(source) {
    try {
        if (source.delay) await new Promise(r => setTimeout(r, source.delay));
        const userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
        const res = await fetch(source.url, {
            headers: {
                'User-Agent': ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 15000
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        const articles = [];
        const seenUrls = new Set();

        $(source.selectors.articles).each((i, el) => {
            if (articles.length >= 20) return false;
            const $el = $(el);

            // Get URL
            let url = $el.find(source.selectors.link).first().attr('href') || $el.closest('a').attr('href') || $el.attr('href');
            if (!url) return;
            if (url.startsWith('/')) url = source.baseUrl + url;
            if (!url.startsWith('http')) return;
            if (url === source.url || url === source.baseUrl || url === source.baseUrl + '/') return;
            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            // Get title — must be meaningful
            const title = ($el.find(source.selectors.title).first().text() || $el.find('h1,h2,h3,h4').first().text()).trim();
            if (!title || title.length < 10) return;
            // Skip obvious nav/section headers
            const skipTitles = ['basketball', 'news', 'latest', 'home', 'menu', 'search', 'more', 'sports'];
            if (skipTitles.includes(title.toLowerCase())) return;
            // Skip press release boilerplate (very long titles with company names)
            if (title.length > 120) return;

            // Get image
            let image = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || $el.find('img').first().attr('data-lazy-src');
            if (image && image.startsWith('/')) image = source.baseUrl + image;
            if (image && !image.startsWith('http')) image = null;
            // Skip tiny placeholder/icon images
            if (image && (image.includes('placeholder') || image.includes('blank') || image.includes('pixel'))) image = null;

            articles.push({ title, url, image: image || null, source: source.source, tag: source.tag });
        });

        return articles;
    } catch (e) {
        console.error(`[${source.id}] Scrape error:`, e.message);
        return [];
    }
}

async function fetchOGImage(url) {
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProperHoopsBot/1.0)' }, timeout: 8000 });
        if (!res.ok) return null;
        const html = await res.text();
        const $ = cheerio.load(html);
        return $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || null;
    } catch (e) { return null; }
}

// ─── Post to Ghost ─────────────────────────────────────────────────────────
async function postToGhost(article) {
    try {
        let image = article.image;
        if (!image) image = await fetchOGImage(article.url);

        if (DRY_RUN) { console.log(`  [DRY RUN] "${article.title}" (${article.source})`); return true; }

        await ghost.posts.add({
            title: article.title.slice(0, 255),
            status: 'published',
            twitter_description: article.url,
            twitter_title: article.source,
            tags: [{ name: article.tag }, { name: 'Auto-Posted' }],
            feature_image: image || undefined,
            custom_excerpt: article.summary || undefined
        }, { source: 'html' });

        postedUrls.add(article.url);
        console.log(`  ✅ "${article.title}" (${article.source})`);
        return true;
    } catch (e) {
        console.error(`  ❌ "${article.title}":`, e.message);
        return false;
    }
}

// ─── Poll ──────────────────────────────────────────────────────────────────
async function poll() {
    console.log(`\n[${new Date().toISOString()}] Polling ${SOURCES.length} sources...`);
    let totalNew = 0;

    for (const source of SOURCES) {
        console.log(`→ ${source.id}`);
        const articles = source.type === 'rss' ? await fetchRSS(source) : await fetchScrape(source);
        console.log(`  ${articles.length} articles`);

        for (const article of articles) {
            if (postedUrls.has(article.url)) continue;
            const ok = await postToGhost(article);
            if (ok) { totalNew++; await new Promise(r => setTimeout(r, 1500)); }
        }
    }
    console.log(`\n✓ Done — ${totalNew} new articles posted.`);
}

// ─── HTTP server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.url === '/poll' && req.method === 'POST') {
        res.writeHead(200); res.end('Poll triggered');
        poll().catch(console.error);
    } else {
        res.writeHead(200); res.end(`ProperHoops RSS Poster — ${new Date().toISOString()}`);
    }
}).listen(PORT, () => console.log(`Server on port ${PORT}`));

// ─── Start ─────────────────────────────────────────────────────────────────
console.log(`ProperHoops RSS Poster starting`);
console.log(`Ghost: ${GHOST_URL} | Poll: every ${POLL_MINUTES}min | Dry run: ${DRY_RUN}`);

loadPostedUrls().then(() => {
    poll().catch(console.error);
    setInterval(() => poll().catch(console.error), POLL_MINUTES * 60 * 1000);
});
