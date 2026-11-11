import firebaseConfig from "../firebase-applet-config.json";

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

function toValidIsoDate(dateStr: any, fallback: string): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return fallback;
  return d.toISOString().split("T")[0];
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
          limit: 100,
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
          date:
            fields.date?.timestampValue ||
            doc.createTime ||
            new Date().toISOString(),
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
    const today = new Date().toISOString().split("T")[0];

    const seenUrls = new Set<string>();
    const itemsXml = customNews
      .map((item: any) => {
        const rawKey = String(item.id || item.title || "").trim();
        if (!rawKey) return "";
        const itemUrl = `https://www.techhabesha.com.et/?news=${encodeURIComponent(rawKey)}`;
        if (seenUrls.has(itemUrl)) return "";
        seenUrls.add(itemUrl);

        const validImage =
          item.imageUrl && /^https?:\/\//i.test(item.imageUrl)
            ? item.imageUrl
            : null;
        const imageTag = validImage
          ? `\n    <image:image>\n      <image:loc>${escapeXml(validImage)}</image:loc>\n      <image:title>${escapeXml(item.title || "Tech Habesha")}</image:title>\n    </image:image>`
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

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1200");
    res.status(200).send(sitemap);
  } catch (err) {
    res.status(500).send("Error generating Sitemap");
  }
}
