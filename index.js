const fetch = require('node-fetch');
const RSSParser = require('rss-parser');
const cheerio = require('cheerio');
const GhostAdminAPI = require('@tryghost/admin-api');
const cron = require('node-cron');

// ─── Config ────────────────────────────────────────────────────────────────
const GHOST_URL = process.env.GHOST_URL || 'https://www.properhoops.au';
const GHOST_ADMIN_KEY = process.env.GHOST_ADMIN_KEY || '69c3503c0eefc50001bae904:bcefcb5444e460031f30fcbfb0d943324c99bfa207aa5d3afb51d61a708821c5';
const POLL_INTERVAL = process.env.POLL_INTERVAL || '*/30 * * * *';
const DRY_RUN = process.env.DRY_RUN === 'true';

// ─── Ghost client ──────────────────────────────────────────────────────────
const ghost = new GhostAdminAPI({
    url: GHOST_URL,
    key: GHOST_ADMIN_KEY,
    version: 'v5.0'
});

// ─── RSS parser ────────────────────────────────────────────────────────────
const parser = new RSSParser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProperHoopsBot/1.0)' }
});

// ─── Sources ───────────────────────────────────────────────────────────────
const SOURCES = [
    {
        id: 'nba-espn',
        label: 'NBA',
        source: 'ESPN',
        type: 'rss',
        url: 'https://www.espn.com/espn/rss/nba/news',
        tag: 'NBA'
    },
    {
        id: 'wnba-espn',
        label: 'WNBA',
        source: 'ESPN',
        type: 'rss',
        url: 'https://www.espn.com/espn/rss/wnba/news',
        tag: 'WNBA'
    },
    {
        id: 'ncaa-espn',
        label: 'NCAA Basketball',
        source: 'ESPN',
        type: 'rss',
        url: 'https://www.espn.com/espn/rss/ncb/news',
        tag: 'NCAA Basketball'
    },
    {
        id: 'nbl',
        label: 'NBL',
        source: 'NBL',
        type: 'scrape',
        url: 'https://www.nbl.com.au/news',
        baseUrl: 'https://www.nbl.com.au',
        tag: 'NBL',
        selectors: {
            articles: 'article, .news-card, .article-card, [class*="news-item"], [class*="article"]',
            title: 'h2, h3, .title, [class*="title"]',
            link: 'a',
            image: 'img',
            summary: 'p, .summary, [class*="summary"], [class*="excerpt"]'
        }
    },
    {
        id: 'wnbl',
        label: 'WNBL',
        source: 'WNBL',
        type: 'scrape',
        url: 'https://www.wnbl.com.au/news',
        baseUrl: 'https://www.wnbl.com.au',
        tag: 'WNBL',
        selectors: {
            articles: 'article, .news-card, .article-card, [class*="news-item"], [class*="article"]',
            title: 'h2, h3, .title, [class*="title"]',
            link: 'a',
            image: 'img',
            summary: 'p, .summary, [class*="summary"], [class*="excerpt"]'
        }
    },
    {
        id: 'fiba',
        label: 'FIBA',
        source: 'FIBA',
        type: 'scrape',
        url: 'https://www.fiba.basketball/en/news',
        baseUrl: 'https://www.fiba.basketball',
        tag: 'FIBA',
        selectors: {
            articles: 'article, .news-card, [class*="news"], [class*="article"]',
            title: 'h2, h3, h4, .title, [class*="title"]',
            link: 'a',
            image: 'img',
            summary: 'p, .summary, [class*="summary"]'
        }
    },
    {
        id: 'unrivaled',
        label: 'Unrivaled',
        source: 'Unrivaled',
        type: 'scrape',
        url: 'https://www.unrivaled.basketball/news',
        baseUrl: 'https://www.unrivaled.basketball',
        tag: 'Unrivaled',
        selectors: {
            articles: 'article, .news-card, [class*="news"], [class*="article"], [class*="post"]',
            title: 'h2, h3, h4, .title, [class*="title"], [class*="heading"]',
            link: 'a',
            image: 'img',
            summary: 'p, .summary, [class*="summary"], [class*="excerpt"]'
        }
    }
];

// ─── Duplicate check via Ghost ─────────────────────────────────────────────
// Instead of a local file, we check Ghost itself for existing posts
// by searching for the external URL stored in twitter_description
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
        console.log(`Loaded ${postedUrls.size} already-posted URLs from Ghost`);
    } catch (e) {
        console.error('Could not load existing posts:', e.message);
    }
}

// ─── RSS fetch ─────────────────────────────────────────────────────────────
async function fetchRSS(source) {
    try {
        const feed = await parser.parseURL(source.url);
        return feed.items.slice(0, 20).map(item => ({
            id: item.guid || item.link || item.title,
            title: item.title,
            url: item.link,
            summary: item.contentSnippet || item.summary || '',
            image: extractRSSImage(item),
            source: source.source,
            tag: source.tag
        })).filter(i => i.title && i.url);
    } catch (e) {
        console.error(`[${source.id}] RSS fetch error:`, e.message);
        return [];
    }
}

function extractRSSImage(item) {
    if (item.enclosure && item.enclosure.url) return item.enclosure.url;
    if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
        return item['media:content']['$'].url;
    }
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) {
        return item['media:thumbnail']['$'].url;
    }
    if (item.content) {
        const match = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match) return match[1];
    }
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

        $(source.selectors.articles).each((i, el) => {
            if (i >= 20) return false;
            const $el = $(el);

            let url = $el.find(source.selectors.link).first().attr('href') ||
                      $el.closest('a').attr('href') ||
                      $el.attr('href');
            if (!url) return;
            if (url.startsWith('/')) url = source.baseUrl + url;
            if (!url.startsWith('http')) return;
            if (url === source.url || url === source.baseUrl + '/') return;

            const title = $el.find(source.selectors.title).first().text().trim() ||
                          $el.find('h1,h2,h3,h4').first().text().trim();
            if (!title || title.length < 5) return;

            let image = $el.find(source.selectors.image).first().attr('src') ||
                        $el.find('img').first().attr('src') ||
                        $el.find('img').first().attr('data-src');
            if (image && image.startsWith('/')) image = source.baseUrl + image;

            const summary = $el.find(source.selectors.summary).first().text().trim();

            articles.push({
                id: url,
                title,
                url,
                summary: summary.slice(0, 300),
                image: image || null,
                source: source.source,
                tag: source.tag
            });
        });

        const seen = new Set();
        return articles.filter(a => {
            if (seen.has(a.url)) return false;
            seen.add(a.url);
            return true;
        });

    } catch (e) {
        console.error(`[${source.id}] Scrape error:`, e.message);
        return [];
    }
}

// ─── OG image fetcher ─────────────────────────────────────────────────────
async function fetchOGImage(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ProperHoopsBot/1.0)' },
            timeout: 8000
        });
        if (!res.ok) return null;
        const html = await res.text();
        const $ = cheerio.load(html);
        return $('meta[property="og:image"]').attr('content') ||
               $('meta[name="twitter:image"]').attr('content') ||
               null;
    } catch (e) {
        return null;
    }
}

// ─── Post to Ghost ─────────────────────────────────────────────────────────
async function postToGhost(article) {
    try {
        let image = article.image;
        if (!image && article.url) {
            console.log(`  Fetching OG image from ${article.url}`);
            image = await fetchOGImage(article.url);
        }

        const postData = {
            title: article.title,
            status: 'published',
            twitter_description: article.url,
            twitter_title: article.source,
            tags: [{ name: article.tag }, { name: 'Auto-Posted' }],
            feature_image: image || undefined,
            custom_excerpt: article.summary ? article.summary.slice(0, 300) : undefined
        };

        if (DRY_RUN) {
            console.log(`  [DRY RUN] Would post: "${article.title}" (${article.source})`);
            return true;
        }

        const post = await ghost.posts.add(postData, { source: 'html' });
        postedUrls.add(article.url);
        console.log(`  ✅ Posted: "${article.title}"`);
        return true;
    } catch (e) {
        console.error(`  ❌ Failed to post "${article.title}":`, e.message);
        return false;
    }
}

// ─── Main poll ─────────────────────────────────────────────────────────────
async function poll() {
    console.log(`\n[${new Date().toISOString()}] Polling ${SOURCES.length} sources...`);
    let totalNew = 0;

    for (const source of SOURCES) {
        console.log(`\n→ ${source.id} (${source.type})`);
        const articles = source.type === 'rss'
            ? await fetchRSS(source)
            : await fetchScrape(source);

        console.log(`  Found ${articles.length} articles`);

        for (const article of articles) {
            if (postedUrls.has(article.url)) continue;

            console.log(`  New: "${article.title}"`);
            const ok = await postToGhost(article);
            if (ok) {
                totalNew++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    console.log(`\n✓ Done. ${totalNew} new articles posted.`);
}

// ─── Health check server (keeps Render free tier alive) ───────────────────
const http = require('http');
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('OK');
}).listen(process.env.PORT || 3000);

// ─── Start ─────────────────────────────────────────────────────────────────
console.log('ProperHoops RSS Poster starting...');
console.log(`Ghost URL: ${GHOST_URL}`);
console.log(`Poll interval: ${POLL_INTERVAL}`);
console.log(`Dry run: ${DRY_RUN}`);

loadPostedUrls().then(() => {
    poll().catch(console.error);
    cron.schedule(POLL_INTERVAL, () => {
        poll().catch(console.error);
    });
});
