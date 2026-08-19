const fs = require('fs');

// Fix index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/\/logo-main\.png/g, 'https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png');
fs.writeFileSync('index.html', html);

// Fix manifest.json
let manifest = fs.readFileSync('public/manifest.json', 'utf8');
manifest = manifest.replace(/\/logo-main\.png/g, 'https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png');
manifest = manifest.replace(/logo-main\.png/g, 'https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png');
fs.writeFileSync('public/manifest.json', manifest);

console.log("HTML and Manifest fixed.");
