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
const ghost = new GhostAdminAPI({
    url: GHOST_URL,
    key: GHOST_ADMIN_KEY,
    version: 'v5.0'
});

const parser = new RSSParser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProperHoopsBot/1.0)' }
});

// ─── Sources ───────────────────────────────────────────────────────────────
const SOURCES = [
    // NBA.com — RSS via their news feed
    {
        id: 'nba',
        source: 'NBA',
        tag: 'NBA',
        type: 'rss',
        url: 'https://www.nba.com/rss/nba_rss.xml'
    },
    // CBS Sports — NCAA Men's Basketball RSS
    {
        id: 'cbs-ncaam',
        source: 'CBS Sports',
        tag: 'NCAA Basketball',
        type: 'rss',
        url: 'https://www.cbssports.com/rss/headlines/college-basketball'
    },
    // CBS Sports — NBA RSS
    {
        id: 'cbs-nba',
        source: 'CBS Sports',
        tag: 'NBA',
        type: 'rss',
        url: 'https://www.cbssports.com/rss/headlines/nba'
    },
    // Front Office Sports — basketball tag (scrape)
    {
        id: 'fos-basketball',
        source: 'Front Office Sports',
        tag: 'Basketball',
        type: 'scrape',
        url: 'https://frontofficesports.com/tag/basketball/',
        baseUrl: 'https://frontofficesports.com',
        selectors: {
            articles: 'article, .post-card, [class*="article"], [class*="post-item"]',
            title: 'h2, h3, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img, [class*="thumbnail"]',
            summary: 'p, [class*="excerpt"], [class*="summary"]'
        }
    },
    // Fox Sports Australia — basketball
    {
        id: 'foxsports-au',
        source: 'Fox Sports AU',
        tag: 'Basketball',
        type: 'scrape',
        url: 'https://www.foxsports.com.au/basketball/latest-news',
        baseUrl: 'https://www.foxsports.com.au',
        selectors: {
            articles: 'article, [class*="article"], [class*="story"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img',
            summary: 'p, [class*="summary"], [class*="excerpt"]'
        }
    },
    // Basketball Australia
    {
        id: 'basketball-au',
        source: 'Basketball Australia',
        tag: 'Basketball Australia',
        type: 'scrape',
        url: 'https://www.basketball.com.au/news/',
        baseUrl: 'https://www.basketball.com.au',
        selectors: {
            articles: 'article, [class*="news-item"], [class*="article"], [class*="card"]',
            title: 'h2, h3, h4, [class*="title"]',
            link: 'a',
            image: 'img',
            summary: 'p, [class*="excerpt"], [class*="summary"]'
        }
    },
    // Australia Basketball (national team / BA official)
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
            image: 'img',
            summary: 'p, [class*="excerpt"], [class*="summary"]'
        }
    },
    // NCAA Men's basketball news
    {
        id: 'ncaa-men',
        source: 'NCAA',
        tag: 'NCAA Basketball',
        type: 'scrape',
        url: 'https://www.ncaa.com/sports/basketball-men/d1',
        baseUrl: 'https://www.ncaa.com',
        selectors: {
            articles: 'article, [class*="news"], [class*="article"], [class*="story"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img',
            summary: 'p, [class*="excerpt"], [class*="summary"]'
        }
    },
    // NCAA Women's basketball news
    {
        id: 'ncaa-women',
        source: 'NCAA',
        tag: 'NCAA Basketball',
        type: 'scrape',
        url: 'https://www.ncaa.com/sports/basketball-women/d1',
        baseUrl: 'https://www.ncaa.com',
        selectors: {
            articles: 'article, [class*="news"], [class*="article"], [class*="story"]',
            title: 'h2, h3, h4, [class*="title"], [class*="headline"]',
            link: 'a',
            image: 'img',
            summary: 'p, [class*="excerpt"], [class*="summary"]'
        }
    },
    // NBL
    {
        id: 'nbl',
        source: 'NBL',
        tag: 'NBL',
        type: 'scrape',
        url: 'https://www.nbl.com.au/news',
        baseUrl: 'https://www.nbl.com.au',
        selectors: {
            articles: 'article, [class*="news-card"], [class*="article"], [class*="card"]',
            title: 'h2, h3, [class*="title"]',
            link: 'a',
            image: 'img',
            summary: 'p, [class*="summary"], [class*="excerpt"]'
        }
    },
    // WNBL
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
            image: 'img',
            summary: 'p, [class*="summary"], [class*="excerpt"]'
        }
    },
    // FIBA
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
            image: 'img',
            summary: 'p, [class*="summary"]'
        }
    },
    // Unrivaled
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
            image: 'img',
            summary: 'p, [class*="summary"], [class*="excerpt"]'
        }
    }
];

// ─── Duplicate check via Ghost ─────────────────────────────────────────────
let postedUrls = new Set();

async function loadPostedUrls() {
    try {
        console.log('Loading existing posts from Ghost...');
        let page = 1;
        let hasMore = true;
        while (hasMore) {
            const posts = await ghost.posts.browse({
                limit: 100,
                page,
                fields: 'id,twitter_description',
                filter: 'tag:Auto-Posted'
            });
            posts.forEach(p => {
                if (p.twitter_description) postedUrls.add(p.twitter_description);
            });
            hasMore = posts.meta && posts.meta.pagination && page < posts.meta.pagination.pages;
            page++;
        }
        console.log(`Loaded ${postedUrls.size} already-posted URLs`);
    } catch (e) {
        console.error('Could not load existing posts:', e.message);
    }
}

// ─── RSS fetch ─────────────────────────────────────────────────────────────
async function fetchRSS(source) {
    try {
        const feed = await parser.parseURL(source.url);
        return feed.items.slice(0, 20).map(item => ({
            title: item.title,
            url: item.link,
            summary: item.contentSnippet || '',
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

// ─── Scrape fetch ──────────────────────────────────────────────────────────
async function fetchScrape(source) {
    try {
        const res = await fetch(source.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

            let url = $el.find(source.selectors.link).first().attr('href') || $el.closest('a').attr('href') || $el.attr('href');
            if (!url) return;
            if (url.startsWith('/')) url = source.baseUrl + url;
            if (!url.startsWith('http')) return;
            if (url === source.url || url === source.baseUrl || url === source.baseUrl + '/') return;
            if (seenUrls.has(url)) return;
            seenUrls.add(url);

            const title = ($el.find(source.selectors.title).first().text() || $el.find('h1,h2,h3,h4').first().text()).trim();
            if (!title || title.length < 5) return;

            let image = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || $el.find('img').first().attr('data-lazy-src');
            if (image && image.startsWith('/')) image = source.baseUrl + image;
            if (image && !image.startsWith('http')) image = null;

            const summary = ($el.find(source.selectors.summary).first().text() || '').trim().slice(0, 300);

            articles.push({ title, url, summary, image: image || null, source: source.source, tag: source.tag });
        });

        return articles;
    } catch (e) {
        console.error(`[${source.id}] Scrape error:`, e.message);
        return [];
    }
}

// ─── OG image fetch ────────────────────────────────────────────────────────
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
            title: article.title,
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
        console.log(`  ${articles.length} articles found`);

        for (const article of articles) {
            if (postedUrls.has(article.url)) continue;
            const ok = await postToGhost(article);
            if (ok) { totalNew++; await new Promise(r => setTimeout(r, 1500)); }
        }
    }
    console.log(`\n✓ Done — ${totalNew} new articles posted.`);
}

// ─── Keep-alive HTTP server ────────────────────────────────────────────────
// This also acts as an endpoint for an uptime monitor to ping every 10 mins
// which keeps Render's free tier alive between polls
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.url === '/poll' && req.method === 'POST') {
        // Allow manual trigger via POST /poll
        res.writeHead(200);
        res.end('Poll triggered');
        poll().catch(console.error);
    } else {
        res.writeHead(200);
        res.end(`ProperHoops RSS Poster running. Last check: ${new Date().toISOString()}`);
    }
}).listen(PORT, () => console.log(`Health check server on port ${PORT}`));

// ─── Start ─────────────────────────────────────────────────────────────────
console.log(`Starting ProperHoops RSS Poster`);
console.log(`Ghost: ${GHOST_URL}`);
console.log(`Poll interval: every ${POLL_MINUTES} minutes`);

loadPostedUrls().then(() => {
    // Run immediately on startup
    poll().catch(console.error);

    // Then use setInterval instead of node-cron — more reliable on Render free tier
    setInterval(() => {
        poll().catch(console.error);
    }, POLL_MINUTES * 60 * 1000);
});
