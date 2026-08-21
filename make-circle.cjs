const Jimp = require('jimp');
const fs = require('fs');

async function processLogo() {
  try {
    console.log("Downloading and processing image...");
    const image = await Jimp.read('https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png');
    
    // Make it circular (adds transparent background)
    image.circle();
    
    // Save main circular logo
    await image.writeAsync('public/logo-circular.png');
    console.log("Saved public/logo-circular.png");

    // Save 192x192
    const fav192 = image.clone().resize(192, 192);
    await fav192.writeAsync('public/favicon-192.png');
    
    // Save 48x48
    const fav48 = image.clone().resize(48, 48);
    await fav48.writeAsync('public/favicon-48.png');
    
    // Save apple touch icon
    await image.writeAsync('public/apple-touch-icon.png');

    console.log("All circular icons generated successfully!");
  } catch (error) {
    console.error("Error processing image:", error);
  }
}

processLogo();
