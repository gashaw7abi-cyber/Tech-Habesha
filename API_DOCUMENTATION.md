# Tech Habesha API Documentation

This document outlines the APIs and data sources used by the Tech Habesha application to fetch and display the latest technology news.

## 1. Backend News Aggregator API (`/api/news`)

The application has a custom backend endpoint that aggregates news from multiple sources. Once deployed, this route serves as the primary source for news articles.

**Endpoint:** `GET /api/news`

**Data Sources used in the backend:**
*   **RSS Feeds (parsed using `rss-parser`):**
    *   **TechCrunch:** `https://techcrunch.com/category/gadgets/feed/`
    *   **The Verge:** `https://www.theverge.com/rss/index.xml`
    *   **Engadget:** `https://www.engadget.com/rss.xml`
*   **Hacker News API:**
    *   Top Stories: `https://hacker-news.firebaseio.com/v0/topstories.json`
    *   Individual Item: `https://hacker-news.firebaseio.com/v0/item/{id}.json`

---

## 2. Client-Side Fallback Fetching

In cases where the backend API (`/api/news`) is unreachable (e.g., due to specific domain/deployment configurations), the client-side React application will automatically fall back to fetching data directly from the browser.

**APIs used in the client-side fallback:**
*   **Hacker News API:**
    *   Direct fetch to `https://hacker-news.firebaseio.com/v0/topstories.json` for live updates.
*   **RSS to JSON Converter API (`rss2json.com`):**
    *   Since direct fetching of RSS feeds in the browser is often blocked by CORS (Cross-Origin Resource Sharing) policies, the application uses the public `api.rss2json.com` service to convert XML RSS feeds into readable JSON.
    *   Endpoint utilized: `https://api.rss2json.com/v1/api.json?rss_url={feed_url}`

---

## 3. Persistent Storage and Custom News

*   **Firebase Firestore:**
    *   The application also reads from and writes to a connected Firebase Firestore database (`custom_news` collection) to manage manually added news items by the platform administrators.
