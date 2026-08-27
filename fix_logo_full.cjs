const fs = require('fs');
const Jimp = require('jimp');

async function fix() {
  const logoFile = fs.readFileSync('src/logo.ts', 'utf8');
  const match = logoFile.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
  const buffer = Buffer.from(match[1], 'base64');
  const img = await Jimp.read(buffer);
  
  // Real bounds based on our analysis (ignoring faint shadows at the edges)
  // x: 10, y: 7, width: 235, height: 236
  // We want a perfect square, so let's take max dimension: 236
  // Center it: x=9, y=7, w=236, h=236
  
  img.crop(9, 7, 236, 236);
  
  // Now we have a tightly cropped logo without the extra padding
  // Let's generate the favicons from this tightly cropped version
  const sizes = [16, 32, 48, 96, 180, 192];
  for (let s of sizes) {
    const resized = img.clone().resize(s, s);
    let name = `public/favicon-${s}.png`;
    if (s === 180) name = 'public/apple-touch-icon.png';
    await resized.writeAsync(name);
  }
  
  // favicon.ico
  const f32 = img.clone().resize(32, 32);
  const icoBuf = await f32.getBufferAsync(Jimp.MIME_PNG);
  fs.writeFileSync('public/favicon.ico', icoBuf);
  
  console.log('Tightly cropped favicons generated!');
}
fix();
