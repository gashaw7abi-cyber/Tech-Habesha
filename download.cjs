const fs = require('fs');
const https = require('https');

https.get('https://i.postimg.cc/0jNPCtMd/1780250553611.jpg', (res) => {
  const file = fs.createWriteStream('./public/favicon.jpg');
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('Downloaded');
  });
}).on('error', (err) => {
  console.error(err);
});
