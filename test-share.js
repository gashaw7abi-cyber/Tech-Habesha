const fetch = require('node-fetch');
async function test() {
  const imageUrl = "https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png";
  const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}&output=jpg`;
  try {
    const res = await fetch(proxiedUrl);
    console.log(res.status, res.headers.get('content-type'));
  } catch (e) {
    console.error(e);
  }
}
test();
