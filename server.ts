import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Parser from "rss-parser";
import firebaseConfig from "./firebase-applet-config.json";

const parser = new Parser({
  customFields: {
    item: ['media:content', 'media:thumbnail', 'content:encoded', 'description'],
  }
});

let cachedNews: any[] = [];
let lastCacheTime = 0;
let isRefreshing = false;
const CACHE_TTL_MS = 8 * 60 * 1000; // 8 minutes cache

async function fetchFirestoreCustomNews(): Promise<any[]> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents:runQuery?key=${firebaseConfig.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "custom_news" }],
          orderBy: [{ field: { fieldPath: "date" }, direction: "DESCENDING" }],
          limit: 50,
        },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((row: any) => row.document && row.document.fields)
      .map((row: any) => {
        const doc = row.document;
        const fields = doc.fields;
        const docId = doc.name.split("/").pop();
        return {
          id: docId,
          title: fields.title?.stringValue || "Tech Habesha News",
          source: fields.source?.stringValue || "Tech Habesha",
          date:
            fields.date?.timestampValue ||
            doc.createTime ||
            new Date().toISOString(),
          content: fields.content?.stringValue || "",
          metaDescription: fields.metaDescription?.stringValue || undefined,
          link: fields.link?.stringValue || "",
          imageUrl: fields.imageUrl?.stringValue || null,
        };
      });
  } catch (err) {
    return [];
  }
}

async function refreshNewsCache(): Promise<any[]> {
  if (isRefreshing) return cachedNews;
  isRefreshing = true;
  try {
    let combinedNews: any[] = [];

    // 1. Fetch custom news from Firestore + rich tech news RSS feeds in parallel
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

    const [customItems, ...rssResults] = await Promise.all([
      fetchFirestoreCustomNews(),
      ...rssPromises
    ]);

    const seenKeys = new Set<string>();
    for (const item of customItems) {
      const uniqueKey = String(item.id || item.link || item.title || "").trim();
      if (uniqueKey && !seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        combinedNews.push(item);
      }
    }

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
      if (cachedNews.length > 0) {
        res.json(cachedNews);
        if (Date.now() - lastCacheTime > CACHE_TTL_MS) {
          refreshNewsCache().catch(console.error);
        }
        return;
      }

      const news = await refreshNewsCache();
      res.json(news);
    } catch (error) {
      console.error("Error fetching tech news:", error);
      res.status(500).json({ error: "Failed to fetch tech news" });
    }
  });

  // Helper to sanitize and escape XML
  const escapeXml = (unsafe: string) => {
    return String(unsafe || "")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  };

  const toValidRfc822Date = (dateStr: any, fallback: string) => {
    if (!dateStr) return fallback;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? fallback : d.toUTCString();
  };

  const toValidIsoDate = (dateStr: any, fallback: string) => {
    if (!dateStr) return fallback;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? fallback : d.toISOString().split("T")[0];
  };

  const getImageMimeType = (url: string) => {
    if (!url) return "image/jpeg";
    const lower = url.toLowerCase();
    if (lower.includes(".png")) return "image/png";
    if (lower.includes(".webp")) return "image/webp";
    if (lower.includes(".gif")) return "image/gif";
    return "image/jpeg";
  };

  // Google Discover / Feed RSS 2.0 Endpoint
  app.get(["/rss.xml", "/feed.xml", "/rss"], async (req, res) => {
    try {
      let newsItems = cachedNews;
      if (newsItems.length === 0) {
        newsItems = await refreshNewsCache();
      }

      const buildDate = new Date().toUTCString();
      const seenUrls = new Set<string>();
      const validItems: any[] = [];

      for (const item of newsItems) {
        if (!item || !item.title) continue;
        const rawKey = String(item.id || item.link || item.title).trim();
        if (!rawKey) continue;
        const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(rawKey)}`;
        if (seenUrls.has(itemUrl)) continue;
        seenUrls.add(itemUrl);
        validItems.push({ ...item, itemUrl });
      }

      // Guarantee at least one item so RSS 2.0 never fails Google Search Console validation
      if (validItems.length === 0) {
        validItems.push({
          title: "Tech Habesha - Leading Ethiopian Technology News & Startups Platform",
          source: "Tech Habesha",
          date: new Date().toISOString(),
          content: "Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.",
          imageUrl: "https://www.techhabesha.com.et/favicon-512.png",
          itemUrl: "https://www.techhabesha.com.et/"
        });
      }

      const itemsXml = validItems.slice(0, 50).map((item) => {
        const itemDate = toValidRfc822Date(item.date, buildDate);
        const validImage =
          item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
            ? item.imageUrl
            : "https://www.techhabesha.com.et/favicon-512.png";
        const mimeType = getImageMimeType(validImage);
        const cleanSummary = (item.metaDescription || item.content || item.title || "").slice(0, 600);

        return `    <item>
      <title>${escapeXml(item.title || "Tech News")}</title>
      <link>${escapeXml(item.itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(item.itemUrl)}</guid>
      <pubDate>${itemDate}</pubDate>
      <dc:creator>${escapeXml(item.source || "Tech Habesha")}</dc:creator>
      <description>${escapeXml(cleanSummary)}</description>
      <enclosure url="${escapeXml(validImage)}" type="${mimeType}" length="150000" />
      <media:content url="${escapeXml(validImage)}" medium="image" type="${mimeType}" />
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

  // Sitemap.xml for Google Discover & Search Engines (never includes /rss.xml inside urlset)
  app.get("/sitemap.xml", async (req, res) => {
    try {
      let newsItems = cachedNews;
      if (newsItems.length === 0) {
        newsItems = await refreshNewsCache();
      }

      const today = new Date().toISOString().split("T")[0];
      const seenUrls = new Set<string>();
      const itemsXml = newsItems
        .slice(0, 100)
        .map((item) => {
          if (!item || !item.title) return "";
          const rawKey = String(item.id || item.link || item.title).trim();
          if (!rawKey) return "";
          const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(rawKey)}`;
          if (seenUrls.has(itemUrl)) return "";
          seenUrls.add(itemUrl);

          const validImage =
            item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
              ? item.imageUrl
              : null;
          const imageTag = validImage
            ? `\n    <image:image>\n      <image:loc>${escapeXml(validImage)}</image:loc>\n      <image:title>${escapeXml(item.title || "Tech News")}</image:title>\n    </image:image>`
            : "";
          const itemDate = toValidIsoDate(item.date, today);

          return `  <url>
    <loc>${escapeXml(itemUrl)}</loc>
    <lastmod>${itemDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>${imageTag}
  </url>`;
        })
        .filter(Boolean)
        .join("\n");

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://www.techhabesha.com.et/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://www.techhabesha.com.et/favicon-512.png</image:loc>
      <image:title>Tech Habesha - Leading Technology News Aggregator</image:title>
    </image:image>
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
