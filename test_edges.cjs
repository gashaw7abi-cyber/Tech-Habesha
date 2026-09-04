const Jimp = require('jimp');
async function check() {
  const img = await Jimp.read('public/favicon-192.png');
  let minX = 192, maxX = 0, minY = 192, maxY = 0;
  for(let y=0; y<192; y++) {
    for(let x=0; x<192; x++) {
      const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
      if (rgba.a > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log('Opaque bounds:', minX, maxX, minY, maxY);
}
check();
