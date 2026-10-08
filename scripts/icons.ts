// Renders the logo (src/app/icon.svg) to the raster icons browsers and home screens need.
// Run after changing the logo: node scripts/icons.ts
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = readFileSync("src/app/icon.svg");
// Home-screen icons are full-bleed squares; iOS and Android apply their own corner mask.
const square = Buffer.from(svg.toString().replace(/ rx="\d+"/, ""));

const png = (source: Buffer, size: number) => sharp(source).resize(size, size).png().toBuffer();

writeFileSync("src/app/apple-icon.png", await png(square, 180));
for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, await png(square, size));

// An ICO file can hold PNG images directly: a 6-byte header, one 16-byte entry per image, then the images.
const images = await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(svg, size) })));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, data }, i) => {
  const entry = 6 + 16 * i;
  header.writeUInt8(size, entry);
  header.writeUInt8(size, entry + 1);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += data.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...images.map(({ data }) => data)]));
