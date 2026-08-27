const fs = require('fs');
const Jimp = require('jimp');

async function analyze() {
  const logoFile = fs.readFileSync('src/logo.ts', 'utf8');
  const match = logoFile.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  const buffer = Buffer.from(match[1], 'base64');
  const img = await Jimp.read(buffer);
  
  let minX = 256, maxX = 0, minY = 256, maxY = 0;
  for(let y=0; y<256; y++) {
    for(let x=0; x<256; x++) {
      const rgba = Jimp.intToRGBA(img.getPixelColor(x, y));
      // Look for pixels that are relatively opaque and not just nearly-black/shadow
      if (rgba.a > 100 && (rgba.r > 20 || rgba.g > 20 || rgba.b > 20)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  console.log('Real bounds (a>100, not black):', minX, maxX, minY, maxY);
}
analyze();
