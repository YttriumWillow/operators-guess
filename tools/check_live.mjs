const urls = [
  'https://operators-guess.pages.dev/',
  'https://operators-guess.pages.dev/js/data/operators.json',
  'https://operators-guess.pages.dev/assets/avatar/char_103_angel.png',
  'https://operators-guess.pages.dev/assets/portrait/char_103_angel_1.png',
];
for (const u of urls) {
  try {
    const r = await fetch(u);
    const buf = await r.arrayBuffer();
    console.log(r.status, r.headers.get('content-type'), buf.byteLength + 'B', u);
  } catch (e) {
    console.log('FAIL', u, e.message);
  }
}
