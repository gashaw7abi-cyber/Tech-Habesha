async function test() {
  const imageUrl = "https://i.postimg.cc/RhgprB7d/file-0000000087f082438bf30653fc9efd0d.png";
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`);
    console.log(res.status, res.headers.get('content-type'));
  } catch (e) {
    console.error(e);
  }
}
test();
