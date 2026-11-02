// public/icons/icon.svg から PNG アイコンを作る（npm run icons）
import sharp from 'sharp';

const src = new URL('../public/icons/icon.svg', import.meta.url);
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const svg = await (await import('node:fs/promises')).readFile(src);

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(decodeURIComponent(out(name)));
  console.log('作成:', name);
}
