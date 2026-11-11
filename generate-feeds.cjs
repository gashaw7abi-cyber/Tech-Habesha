const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");
const firebaseConfig = require("./firebase-applet-config.json");

const parser = new Parser({
  customFields: {
    item: ["media:content", "media:thumbnail", "content:encoded", "description"],
  },
});

function sanitizeXmlString(str) {
  if (!str) return "";
  // Remove invalid XML 1.0 control characters
  return String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function escapeXml(unsafe) {
  return sanitizeXmlString(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toValidRfc822Date(dateStr, fallback) {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return fallback;
  return d.toUTCString();
}

function toValidIsoDate(dateStr, fallback) {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString().split("T")[0];
}

function getImageMimeType(url) {
  if (!url) return "image/jpeg";
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function fetchFirestoreCustomNews() {
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
      .filter((row) => row.document && row.document.fields)
      .map((row) => {
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
          content:
            fields.metaDescription?.stringValue ||
            fields.content?.stringValue ||
            "",
          link: fields.link?.stringValue || "",
          imageUrl: fields.imageUrl?.stringValue || null,
        };
      });
  } catch (err) {
    console.warn("Could not fetch Firestore custom_news for feed build:", err.message);
    return [];
  }
}

async function fetchExternalRssNews() {
  const rssFeeds = [
    "https://techcrunch.com/category/gadgets/feed/",
    "https://techcrunch.com/feed/",
    "https://www.theverge.com/rss/index.xml",
    "https://www.engadget.com/rss.xml",
  ];

  const results = await Promise.all(
    rssFeeds.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        return (feed.items || []).slice(0, 15).map((item) => {
          let imageUrl = null;
          if (item["media:content"]?.$?.url) {
            imageUrl = item["media:content"].$.url;
          } else if (item["media:thumbnail"]?.$?.url) {
            imageUrl = item["media:thumbnail"].$.url;
          } else if (item["content:encoded"] || item.content) {
            const htmlContent = item["content:encoded"] || item.content || "";
            const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) imageUrl = imgMatch[1];
          }

          let cleanDesc = item.contentSnippet || "";
          if (!cleanDesc && (item.description || item["content:encoded"] || item.content)) {
            const rawDesc = item.description || item["content:encoded"] || item.content || "";
            cleanDesc = rawDesc.replace(/<[^>]+>/g, "").trim();
          }

          return {
            id: item.guid || item.link || item.title,
            title: item.title || "Tech News",
            source: feed.title || "Tech Habesha",
            date: item.isoDate || item.pubDate || new Date().toISOString(),
            content: cleanDesc,
            link: item.link || "",
            imageUrl,
          };
        });
      } catch (e) {
        return [];
      }
    })
  );

  return results.flat();
}

async function generateFeeds() {
  const [customNews, rssNews] = await Promise.all([
    fetchFirestoreCustomNews(),
    fetchExternalRssNews(),
  ]);

  const combined = [...customNews, ...rssNews];
  const seenUrls = new Set();
  const uniqueItems = [];

  for (const item of combined) {
    if (!item || !item.title) continue;
    const rawKey = String(item.id || item.link || item.title).trim();
    if (!rawKey) continue;
    const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(rawKey)}`;
    if (seenUrls.has(itemUrl)) continue;
    seenUrls.add(itemUrl);
    uniqueItems.push({ ...item, itemUrl, rawKey });
  }

  // Fallback item if everything is offline so RSS feed is never empty (<item> is required by Google Search Console)
  if (uniqueItems.length === 0) {
    uniqueItems.push({
      id: "welcome-tech-habesha",
      title: "Tech Habesha - Leading Ethiopian Technology News & Startups Platform",
      source: "Tech Habesha",
      date: new Date().toISOString(),
      content:
        "Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.",
      imageUrl: "https://www.techhabesha.com.et/favicon-512.png",
      itemUrl: "https://www.techhabesha.com.et/",
      rawKey: "welcome-tech-habesha",
    });
  }

  const nowUtc = new Date().toUTCString();
  const todayIso = new Date().toISOString().split("T")[0];

  const rssItemsXml = uniqueItems
    .slice(0, 50)
    .map((item) => {
      const pubDate = toValidRfc822Date(item.date, nowUtc);
      const validImage =
        item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
          ? item.imageUrl
          : "https://www.techhabesha.com.et/favicon-512.png";
      const mimeType = getImageMimeType(validImage);
      const cleanSummary = (item.content || item.title || "").slice(0, 600);

      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.itemUrl)}</link>
      <guid isPermaLink="true">${escapeXml(item.itemUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <dc:creator>${escapeXml(item.source || "Tech Habesha")}</dc:creator>
      <description>${escapeXml(cleanSummary)}</description>
      <enclosure url="${escapeXml(validImage)}" type="${mimeType}" length="150000" />
      <media:content url="${escapeXml(validImage)}" medium="image" type="${mimeType}" />
    </item>`;
    })
    .join("\n");

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tech Habesha</title>
    <link>https://www.techhabesha.com.et/</link>
    <description>Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.</description>
    <language>en</language>
    <lastBuildDate>${nowUtc}</lastBuildDate>
    <atom:link href="https://www.techhabesha.com.et/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>https://www.techhabesha.com.et/favicon-512.png</url>
      <title>Tech Habesha</title>
      <link>https://www.techhabesha.com.et/</link>
    </image>
${rssItemsXml}
  </channel>
</rss>
`;

  // Sitemap XML: Only include indexable HTML pages (never include /rss.xml in sitemap.xml!)
  const sitemapItemsXml = uniqueItems
    .slice(0, 100)
    .filter((item) => item.itemUrl !== "https://www.techhabesha.com.et/")
    .map((item) => {
      const lastmod = toValidIsoDate(item.date, todayIso);
      const validImage =
        item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
          ? item.imageUrl
          : null;
      const imageBlock = validImage
        ? `\n    <image:image>\n      <image:loc>${escapeXml(validImage)}</image:loc>\n      <image:title>${escapeXml(item.title)}</image:title>\n    </image:image>`
        : "";

      return `  <url>
    <loc>${escapeXml(item.itemUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>${imageBlock}
  </url>`;
    })
    .join("\n");

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://www.techhabesha.com.et/</loc>
    <lastmod>${todayIso}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
    <image:image>
      <image:loc>https://www.techhabesha.com.et/favicon-512.png</image:loc>
      <image:title>Tech Habesha - Leading Technology News Aggregator</image:title>
    </image:image>
  </url>
${sitemapItemsXml}
</urlset>
`;

  const publicDir = path.join(process.cwd(), "public");
  fs.writeFileSync(path.join(publicDir, "rss.xml"), rssXml, "utf8");
  fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemapXml, "utf8");
  console.log(
    `Generated public/rss.xml (${uniqueItems.slice(0, 50).length} items) and public/sitemap.xml (${uniqueItems.slice(0, 100).length + 1} URLs).`
  );
}

generateFeeds().catch((err) => {
  console.error("Feed generation warning:", err);
  process.exit(0);
});
