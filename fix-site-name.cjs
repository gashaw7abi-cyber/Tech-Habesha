const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// Add og:site_name if missing
if (!html.includes('og:site_name')) {
    html = html.replace('<meta property="og:title"', '<meta property="og:site_name" content="Tech Habesha" />\n    <meta property="og:title"');
}

// Fix the WebSite JSON-LD URL to perfectly match the domain without www (or add both)
html = html.replace('"url": "https://www.techhabesha.com.et/"', '"url": "https://techhabesha.com.et/"');

fs.writeFileSync('index.html', html);
console.log("Fixed index.html site name meta tags");
