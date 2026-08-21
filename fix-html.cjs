const fs = require('fs');

// Fix index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(/https:\/\/i\.postimg\.cc\/RhgprB7d\/file-0000000087f082438bf30653fc9efd0d\.png/g, '/logo-circular.png');
html = html.replace(/https:\/\/techhabesha\.com\.et\/logo-circular\.png/g, 'https://techhabesha.com.et/logo-circular.png');
fs.writeFileSync('index.html', html);

// Fix manifest.json
let manifest = fs.readFileSync('public/manifest.json', 'utf8');
manifest = manifest.replace(/https:\/\/i\.postimg\.cc\/RhgprB7d\/file-0000000087f082438bf30653fc9efd0d\.png/g, '/logo-circular.png');
fs.writeFileSync('public/manifest.json', manifest);

console.log("HTML and Manifest fixed to use local circular logo.");
