# ProperHoops RSS Poster

Automatically posts basketball news from league websites to your Ghost blog.

## Sources monitored
- **NBA** — ESPN NBA RSS feed
- **WNBA** — ESPN WNBA RSS feed  
- **NCAA Basketball** — ESPN College Basketball RSS feed
- **NBL** — nbl.com.au/news (scraped)
- **WNBL** — wnbl.com.au/news (scraped)
- **FIBA** — fiba.basketball/en/news (scraped)
- **Unrivaled** — unrivaled.basketball/news (scraped)

## How it works
1. Every 30 minutes it checks each source for new articles
2. New articles get posted to Ghost as published posts
3. The external URL is stored in the Twitter Description field (your theme uses this for link posts)
4. The source name (e.g. "ESPN", "NBL") is stored in Twitter Title field
5. Each post is tagged by sport + "Auto-Posted"
6. Already-posted articles are tracked in `/data/seen.json` so nothing gets double-posted

## Deploying on PikaPods

PikaPods doesn't directly support custom Docker images from a zip file, so you have two options:

### Option A: GitHub (recommended)
1. Create a free GitHub account if you don't have one
2. Create a new repository called `properhoops-rss-poster`
3. Upload these files to the repo
4. In PikaPods, add a new app → Custom Docker → point to your GitHub repo

### Option B: Docker Hub
1. Install Docker Desktop on your Mac
2. In the `rss-poster` folder, run:
   ```
   docker build -t yourusername/properhoops-rss-poster .
   docker push yourusername/properhoops-rss-poster
   ```
3. In PikaPods, add a new app → Custom Docker → `yourusername/properhoops-rss-poster`

### Environment variables to set in PikaPods:
| Variable | Value |
|----------|-------|
| `GHOST_URL` | `https://www.properhoops.au` |
| `GHOST_ADMIN_KEY` | `69c3503c0eefc50001bae904:bcef...` |
| `POLL_INTERVAL` | `*/30 * * * *` |
| `DRY_RUN` | `false` |

### Volume to mount:
- Mount a persistent volume to `/data` so the seen.json file survives restarts

## Testing locally
```bash
npm install
DRY_RUN=true node index.js
```
Setting `DRY_RUN=true` will show you what would be posted without actually posting anything.

## Adjusting the poll interval
The `POLL_INTERVAL` uses cron syntax:
- `*/30 * * * *` = every 30 minutes
- `*/15 * * * *` = every 15 minutes  
- `0 * * * *` = once per hour

## Adding more sources
Edit `index.js` and add an entry to the `SOURCES` array. Use `type: 'rss'` if the site has an RSS feed, or `type: 'scrape'` to scrape the news page.
