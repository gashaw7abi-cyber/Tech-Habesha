const Jimp = require('jimp');

async function processLogo() {
  const image = await Jimp.read('public/logo-circular.png');
  image.resize(256, 256);
  await image.writeAsync('public/logo-small.png');
  console.log("Resized to 256x256.");
}
processLogo();
