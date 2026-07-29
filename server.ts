import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail', 'content:encoded', 'description'],
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get("/api/news", async (req, res) => {
    try {
      let combinedNews: any[] = [];

      // 1. Fetch from RSS Feeds (TechCrunch, The Verge, Engadget) for Gadgets/Phones/Computers
      const rssFeeds = [
        "https://techcrunch.com/category/gadgets/feed/",
        "https://www.theverge.com/rss/index.xml",
        "https://www.engadget.com/rss.xml"
      ];


      for (const feedUrl of rssFeeds) {
        try {
          const feed = await parser.parseURL(feedUrl);
          const mappedItems = feed.items.map(item => {
            // Extract Image URL
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

            // Extract text description
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
          combinedNews = combinedNews.concat(mappedItems);
        } catch (feedErr) {
          console.error("Error fetching feed:", feedUrl, feedErr);
        }
      }

      // 2. Fetch Hacker News (To keep volume high)
      try {
        const topStoriesRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
        if (topStoriesRes.ok) {
          const storyIds = await topStoriesRes.json();
          const topIds = storyIds.slice(0, 130);
          
          // Chunk the requests
          const hnStories = [];
          for (let i = 0; i < topIds.length; i += 20) {
            const chunk = topIds.slice(i, i + 20);
            const chunkPromises = chunk.map((id: number) => 
              fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
            );
            const storyChunk = await Promise.all(chunkPromises);
            hnStories.push(...storyChunk);
          }
          
          const formattedHN = hnStories.filter(Boolean).map(story => ({
            id: `hn-${story.id}`,
            title: story.title,
            source: "Hacker News",
            date: new Date(story.time * 1000).toISOString(),
            content: "",
            link: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
            imageUrl: null // No image for Hacker News
          }));
          
          combinedNews = combinedNews.concat(formattedHN);
        }
      } catch (hnErr) {
        console.error("Error fetching Hacker News:", hnErr);
      }

      // Sort by date (newest first)
      combinedNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json(combinedNews.slice(0, 200));
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
