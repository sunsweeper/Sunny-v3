/* eslint-disable no-console */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const SOLAR_IMAGE_DIR = path.join(process.cwd(), "public", "images", "solar");
const WATERMARK_DIR = path.join(SOLAR_IMAGE_DIR, "watermarked");
const WATERMARK_TEXT = "SunSweeper.com";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

const escapeSvgText = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const createWatermarkSvg = ({ width, height }) => {
  const fontSize = Math.max(18, Math.min(24, Math.round(width * 0.026)));
  const horizontalPadding = Math.round(fontSize * 0.7);
  const verticalPadding = Math.round(fontSize * 0.35);
  const textWidth = Math.ceil(WATERMARK_TEXT.length * fontSize * 0.58);
  const pillWidth = textWidth + horizontalPadding * 2;
  const pillHeight = fontSize + verticalPadding * 2;
  const imagePadding = 20;
  const x = Math.max(imagePadding, width - pillWidth - imagePadding);
  const y = Math.max(imagePadding, height - pillHeight - imagePadding);
  const radius = Math.round(pillHeight / 2);

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="${radius}" fill="rgba(4, 10, 20, 0.64)"/>
      <text x="${x + horizontalPadding}" y="${y + verticalPadding + fontSize * 0.78}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700" fill="#ffffff" letter-spacing="0.2">${escapeSvgText(WATERMARK_TEXT)}</text>
    </svg>`;
};

async function main() {
  try {
    await fs.access(SOLAR_IMAGE_DIR);
  } catch {
    console.log(`Solar image source directory not found: ${SOLAR_IMAGE_DIR}`);
    return;
  }

  await fs.mkdir(WATERMARK_DIR, { recursive: true });

  const entries = await fs.readdir(SOLAR_IMAGE_DIR, { withFileTypes: true });
  const imageFiles = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (imageFiles.length === 0) {
    console.log(`No .jpg or .png files found in ${SOLAR_IMAGE_DIR}`);
    return;
  }

  console.log(`Found ${imageFiles.length} solar image(s):`);

  for (const fileName of imageFiles) {
    const inputPath = path.join(SOLAR_IMAGE_DIR, fileName);
    const outputPath = path.join(WATERMARK_DIR, fileName);
    const image = sharp(inputPath).rotate();
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.warn(`Skipping ${fileName}: unable to read image dimensions.`);
      continue;
    }

    await image
      .composite([{ input: Buffer.from(createWatermarkSvg({ width: metadata.width, height: metadata.height })), top: 0, left: 0 }])
      .toFile(outputPath);

    console.log(`- ${fileName} -> public/images/solar/watermarked/${fileName}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
