import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail', 'content:encoded', 'description'],
  }
});

let cachedNews: any[] = [];
let lastCacheTime = 0;
let isRefreshing = false;
const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes cache

async function refreshNewsCache(): Promise<any[]> {
  if (isRefreshing) return cachedNews;
  isRefreshing = true;
  try {
    let combinedNews: any[] = [];

    // 1. Fetch RSS feeds in parallel
    const rssFeeds = [
      "https://techcrunch.com/category/gadgets/feed/",
      "https://www.theverge.com/rss/index.xml",
      "https://www.engadget.com/rss.xml"
    ];

    const rssPromises = rssFeeds.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        return feed.items.map(item => {
          let imageUrl = null;
          if (item['media:content']?.$?.url) {
            imageUrl = item['media:content'].$.url;
          } else if (item['media:thumbnail']?.$?.url) {
            imageUrl = item['media:thumbnail'].$.url;
          } else if (item['content:encoded'] || item.content) {
            const htmlContent = item['content:encoded'] || item.content || "";
            const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) {
              imageUrl = imgMatch[1];
            }
          }

          let cleanDesc = item.contentSnippet || "";
          if (!cleanDesc && (item.description || item['content:encoded'] || item.content)) {
            const rawDesc = item.description || item['content:encoded'] || item.content || "";
            cleanDesc = rawDesc.replace(/<[^>]+>/g, '').trim();
          }

          return {
            id: item.guid || Math.random().toString(),
            title: item.title,
            source: feed.title || "Tech Source",
            date: item.isoDate || item.pubDate || new Date().toISOString(),
            content: cleanDesc,
            link: item.link,
            imageUrl: imageUrl
          };
        });
      } catch (feedErr) {
        console.error("Error fetching feed:", feedUrl, feedErr);
        return [];
      }
    });

    const rssResults = await Promise.all(rssPromises);
    for (const feedItems of rssResults) {
      combinedNews = combinedNews.concat(feedItems);
    }

    // 2. Fetch Hacker News (top 60 fast)
    try {
      const topStoriesRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
      if (topStoriesRes.ok) {
        const storyIds = await topStoriesRes.json();
        const topIds = storyIds.slice(0, 60);
        
        const hnPromises = topIds.map((id: number) => 
          fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
            .then(r => r.json())
            .catch(() => null)
        );
        const hnStories = await Promise.all(hnPromises);
        
        const formattedHN = hnStories.filter(Boolean).map(story => ({
          id: `hn-${story.id}`,
          title: story.title,
          source: "Hacker News",
          date: new Date(story.time * 1000).toISOString(),
          content: "",
          link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          imageUrl: null
        }));
        
        combinedNews = combinedNews.concat(formattedHN);
      }
    } catch (hnErr) {
      console.error("Error fetching Hacker News:", hnErr);
    }

    combinedNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (combinedNews.length > 0) {
      cachedNews = combinedNews.slice(0, 200);
      lastCacheTime = Date.now();
    }
  } catch (error) {
    console.error("Error updating news cache:", error);
  } finally {
    isRefreshing = false;
  }
  return cachedNews;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Prewarm cache on server startup in background
  refreshNewsCache().catch(console.error);

  // API Routes
  app.get("/api/news", async (req, res) => {
    try {
      // If we have cached news, return immediately without waiting (< 2ms response!)
      if (cachedNews.length > 0) {
        res.json(cachedNews);
        // If cache is older than TTL, trigger background refresh
        if (Date.now() - lastCacheTime > CACHE_TTL_MS) {
          refreshNewsCache().catch(console.error);
        }
        return;
      }

      // If cache is empty, fetch and respond
      const news = await refreshNewsCache();
      res.json(news);
    } catch (error) {
      console.error("Error fetching tech news:", error);
      res.status(500).json({ error: "Failed to fetch tech news" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
