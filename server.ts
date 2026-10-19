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

    // 1. Fetch rich tech news RSS feeds in parallel (TechCrunch, The Verge, Engadget, Wired)
    const rssFeeds = [
      "https://techcrunch.com/category/gadgets/feed/",
      "https://techcrunch.com/feed/",
      "https://www.theverge.com/rss/index.xml",
      "https://www.engadget.com/rss.xml",
      "https://www.wired.com/feed/category/gear/latest/rss"
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
            id: item.guid || item.link || Math.random().toString(),
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
    const seenKeys = new Set<string>();
    for (const feedItems of rssResults) {
      for (const item of feedItems) {
        const uniqueKey = (item.id || item.link || item.title || "").trim();
        if (uniqueKey && !seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          if (item.link) seenKeys.add(item.link.trim());
          combinedNews.push(item);
        }
      }
    }

    combinedNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (combinedNews.length > 0) {
      cachedNews = combinedNews.slice(0, 150);
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

  // Set permissive CORS for Googlebot and crawlers
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
  });

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

  // Helper to escape XML
  const escapeXml = (unsafe: string) => {
    return (unsafe || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  // Google Discover / Feed RSS 2.0 Endpoint
  app.get(["/rss.xml", "/feed.xml", "/rss"], async (req, res) => {
    try {
      let newsItems = cachedNews;
      if (newsItems.length === 0) {
        newsItems = await refreshNewsCache();
      }

      const buildDate = new Date().toUTCString();
      const itemsXml = newsItems.slice(0, 50).map((item) => {
        const itemDate = item.date ? new Date(item.date).toUTCString() : buildDate;
        const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(item.id || item.link || item.title)}`;
        const enclosureTag = item.imageUrl
          ? `\n      <enclosure url="${escapeXml(item.imageUrl)}" type="image/jpeg" length="0" />\n      <media:content url="${escapeXml(item.imageUrl)}" medium="image" />`
          : "";

        return `    <item>
      <title><![CDATA[${item.title || "Tech News"}]]></title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="false">${escapeXml(String(item.id || item.link || item.title))}</guid>
      <pubDate>${itemDate}</pubDate>
      <source url="https://www.techhabesha.com.et/">${escapeXml(item.source || "Tech Habesha")}</source>
      <description><![CDATA[${item.content || item.title || ""}]]></description>${enclosureTag}
    </item>`;
      }).join("\n");

      const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tech Habesha</title>
    <link>https://www.techhabesha.com.et/</link>
    <description>Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.</description>
    <language>en</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="https://www.techhabesha.com.et/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>https://www.techhabesha.com.et/favicon-512.png</url>
      <title>Tech Habesha</title>
      <link>https://www.techhabesha.com.et/</link>
    </image>
${itemsXml}
  </channel>
</rss>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1200");
      res.send(rssContent);
    } catch (err) {
      console.error("Error generating RSS:", err);
      res.status(500).send("Error generating RSS feed");
    }
  });

  // Sitemap.xml for Google Discover & Search Engines
  app.get("/sitemap.xml", async (req, res) => {
    try {
      let newsItems = cachedNews;
      if (newsItems.length === 0) {
        newsItems = await refreshNewsCache();
      }

      const today = new Date().toISOString().split("T")[0];
      const itemsXml = newsItems.slice(0, 100).map((item) => {
        const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(item.id || item.link || item.title)}`;
        const imageTag = item.imageUrl
          ? `\n    <image:image>\n      <image:loc>${escapeXml(item.imageUrl)}</image:loc>\n      <image:title>${escapeXml(item.title || "Tech News")}</image:title>\n    </image:image>`
          : "";
        const itemDate = item.date ? item.date.split("T")[0] : today;

        return `  <url>
    <loc>${escapeXml(itemUrl)}</loc>
    <lastmod>${itemDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>${imageTag}
  </url>`;
      }).join("\n");

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://www.techhabesha.com.et/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
${itemsXml}
</urlset>`;

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1200");
      res.send(sitemap);
    } catch (err) {
      console.error("Error generating Sitemap:", err);
      res.status(500).send("Error generating Sitemap");
    }
  });
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
