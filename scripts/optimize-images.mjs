/**
 * Optional image optimiser.
 * Put your original product photos (JPG/PNG) in  public/images/products/_raw/
 * then run:  npm run images
 * It writes web-sized .webp files into public/images/products/ (max 1000px, ~82% quality).
 *
 * Requires the optional "sharp" dependency:  npm i sharp
 */
import { readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const SRC = "public/images/products/_raw";
const OUT = "public/images/products";
const MAX = 1000;

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error('Missing "sharp". Install it with:  npm i sharp');
  process.exit(1);
}

try {
  await stat(SRC);
} catch {
  console.error(`No source folder at ${SRC}. Create it and add your photos.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!files.length) {
  console.log("No images found in", SRC);
  process.exit(0);
}

for (const file of files) {
  const base = path.parse(file).name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const dest = path.join(OUT, `${base}.webp`);
  await sharp(path.join(SRC, file))
    .rotate()
    .resize(MAX, MAX, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest);
  console.log("✓", dest);
}
console.log(`\nDone. Reference them in public/data/products.json as "images/products/<name>.webp".`);
