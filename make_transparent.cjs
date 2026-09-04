const fs = require('fs');
const Jimp = require('jimp');

async function fix() {
  const logoFile = fs.readFileSync('src/logo.ts', 'utf8');
  const match = logoFile.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  const buffer = Buffer.from(match[1], 'base64');
  let img = await Jimp.read(buffer);

  // Original logo bounds: ~10, 7 to 244, 242
  img.crop(10, 7, 236, 236);
  img.resize(256, 256); // Just resize the cropped circle to fill the 256x256 completely.
  
  // Actually, let's make sure the background outside the circle is purely transparent.
  // The original image might have a faint grey or we need to ensure the corners are transparent.
  const size = 256;
  const radius = size / 2;
  const centerX = size / 2;
  const centerY = size / 2;
  
  // Make a new fully transparent image
  const result = await new Jimp(size, size, 0x00000000);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      // If inside circle, copy pixel from resized original image
      // We scale the circle slightly so it doesn't leave hard aliased edges
      if (dx * dx + dy * dy <= radius * radius) {
        const color = img.getPixelColor(x, y);
        // Ensure the background inside the circle is black if it was transparent
        const rgba = Jimp.intToRGBA(color);
        if (rgba.a < 255) {
            // blend with black
            result.setPixelColor(0x000000FF, x, y);
        } else {
            result.setPixelColor(color, x, y);
        }
      } else {
        // Outside circle: completely transparent
        result.setPixelColor(0x00000000, x, y);
      }
    }
  }

  const sizes = [16, 32, 48, 96, 180, 192];
  for (let s of sizes) {
    const resized = result.clone().resize(s, s);
    let name = `public/favicon-${s}.png`;
    if (s === 180) name = 'public/apple-touch-icon.png';
    await resized.writeAsync(name);
  }

  const f32 = result.clone().resize(32, 32);
  const icoBuf = await f32.getBufferAsync(Jimp.MIME_PNG);
  fs.writeFileSync('public/favicon.ico', icoBuf);

  console.log('Fixed transparency generated!');
}
fix();
