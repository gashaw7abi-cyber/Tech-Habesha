const fs = require('fs');
const Jimp = require('jimp');

async function fix() {
  const logoFile = fs.readFileSync('src/logo.ts', 'utf8');
  const match = logoFile.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  const buffer = Buffer.from(match[1], 'base64');
  let img = await Jimp.read(buffer);
  
  // Make a solid black square of the exact same size
  const square = await new Jimp(256, 256, '#000000');
  
  // Composite the original image over the black square
  square.composite(img, 0, 0);
  
  // Now write all the favicon sizes
  const sizes = [16, 32, 48, 96, 180, 192];
  for (let s of sizes) {
    const resized = square.clone().resize(s, s);
    let name = `public/favicon-${s}.png`;
    if (s === 180) name = 'public/apple-touch-icon.png';
    await resized.writeAsync(name);
  }
  
  // favicon.ico (32x32)
  const f32 = square.clone().resize(32, 32);
  const icoBuf = await f32.getBufferAsync(Jimp.MIME_PNG);
  fs.writeFileSync('public/favicon.ico', icoBuf);
  
  console.log('Final perfect solid favicons generated!');
}
fix();
