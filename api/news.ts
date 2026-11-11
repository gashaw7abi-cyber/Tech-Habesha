import Parser from "rss-parser";

const parser = new Parser({
  customFields: {
    item: ["media:content", "media:thumbnail", "content:encoded", "description"],
  },
});

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  try {
    const rssFeeds = [
      "https://techcrunch.com/category/gadgets/feed/",
      "https://techcrunch.com/feed/",
      "https://www.theverge.com/rss/index.xml",
      "https://www.engadget.com/rss.xml",
      "https://www.wired.com/feed/category/gear/latest/rss",
    ];

    const rssPromises = rssFeeds.map(async (feedUrl) => {
      try {
        const feed = await parser.parseURL(feedUrl);
        return (feed.items || []).map((item: any) => {
          let imageUrl = null;
          if (item["media:content"]?.$?.url) {
            imageUrl = item["media:content"].$.url;
          } else if (item["media:thumbnail"]?.$?.url) {
            imageUrl = item["media:thumbnail"].$.url;
          } else if (item["content:encoded"] || item.content) {
            const htmlContent = item["content:encoded"] || item.content || "";
            const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) {
              imageUrl = imgMatch[1];
            }
          }

          let cleanDesc = item.contentSnippet || "";
          if (!cleanDesc && (item.description || item["content:encoded"] || item.content)) {
            const rawDesc = item.description || item["content:encoded"] || item.content || "";
            cleanDesc = rawDesc.replace(/<[^>]+>/g, "").trim();
          }

          return {
            id: item.guid || item.link || Math.random().toString(),
            title: item.title,
            source: feed.title || "Tech Habesha",
            date: item.isoDate || item.pubDate || new Date().toISOString(),
            content: cleanDesc,
            link: item.link,
            imageUrl: imageUrl,
          };
        });
      } catch (feedErr) {
        console.warn("Error fetching feed:", feedUrl, feedErr);
        return [];
      }
    });

    const rssResults = await Promise.all(rssPromises);
    const seenKeys = new Set<string>();
    const combinedNews: any[] = [];

    for (const feedItems of rssResults) {
      for (const item of feedItems) {
        const uniqueKey = String(item.id || item.link || item.title || "").trim();
        if (uniqueKey && !seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          if (item.link) seenKeys.add(String(item.link).trim());
          combinedNews.push(item);
        }
      }
    }

    combinedNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.status(200).json(combinedNews.slice(0, 150));
  } catch (error) {
    console.error("Error fetching tech news:", error);
    res.status(500).json({ error: "Failed to fetch tech news" });
  }
}
