const Jimp = require('jimp');
async function check() {
  const img = await Jimp.read('public/favicon-192.png');
  console.log("Top left pixel:", Jimp.intToRGBA(img.getPixelColor(0,0)));
}
check();
