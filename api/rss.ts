import Parser from "rss-parser";
import firebaseConfig from "../firebase-applet-config.json";

const parser = new Parser({
  customFields: {
    item: ["media:content", "media:thumbnail", "content:encoded", "description"],
  },
});

function sanitizeXmlString(str: any): string {
  if (!str) return "";
  return String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function escapeXml(unsafe: any): string {
  return sanitizeXmlString(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toValidRfc822Date(dateStr: any, fallback: string): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return fallback;
  return d.toUTCString();
}

function getImageMimeType(url: string): string {
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
          content:
            fields.metaDescription?.stringValue ||
            fields.content?.stringValue ||
            "",
          link: fields.link?.stringValue || "",
          imageUrl: fields.imageUrl?.stringValue || null,
        };
      });
  } catch (err) {
    return [];
  }
}

export default async function handler(req: any, res: any) {
  try {
    const customNews = await fetchFirestoreCustomNews();
    let rssNews: any[] = [];

    try {
      const feed = await parser.parseURL("https://techcrunch.com/category/gadgets/feed/");
      rssNews = (feed.items || []).slice(0, 20).map((item: any) => {
        let imageUrl = null;
        if (item["media:content"]?.$?.url) {
          imageUrl = item["media:content"].$.url;
        } else if (item["media:thumbnail"]?.$?.url) {
          imageUrl = item["media:thumbnail"].$.url;
        }
        return {
          id: item.guid || item.link || item.title,
          title: item.title || "Tech News",
          source: feed.title || "Tech Habesha",
          date: item.isoDate || item.pubDate || new Date().toISOString(),
          content: (item.contentSnippet || item.description || "").replace(/<[^>]+>/g, "").trim(),
          link: item.link || "",
          imageUrl,
        };
      });
    } catch (e) {}

    const combined = [...customNews, ...rssNews];
    const seenUrls = new Set<string>();
    const uniqueItems: any[] = [];

    for (const item of combined) {
      if (!item || !item.title) continue;
      const rawKey = String(item.id || item.link || item.title).trim();
      if (!rawKey) continue;
      const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(rawKey)}`;
      if (seenUrls.has(itemUrl)) continue;
      seenUrls.add(itemUrl);
      uniqueItems.push({ ...item, itemUrl });
    }

    if (uniqueItems.length === 0) {
      uniqueItems.push({
        title: "Tech Habesha - Leading Ethiopian Technology News & Startups Platform",
        source: "Tech Habesha",
        date: new Date().toISOString(),
        content:
          "Tech Habesha is a leading technology news aggregator and community platform based in Ethiopia, delivering the latest global tech trends, startup news, and digital innovations.",
        imageUrl: "https://www.techhabesha.com.et/favicon-512.png",
        itemUrl: "https://www.techhabesha.com.et/",
      });
    }

    const buildDate = new Date().toUTCString();
    const itemsXml = uniqueItems
      .slice(0, 50)
      .map((item) => {
        const pubDate = toValidRfc822Date(item.date, buildDate);
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

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1200");
    res.status(200).send(rssContent);
  } catch (err) {
    res.status(500).send("Error generating RSS feed");
  }
}
