/* eslint-disable no-console */
const fs = require("node:fs/promises");
const path = require("node:path");
const PUBLIC_DIR = path.join(process.cwd(), "public");
const PREFERRED_SOLAR_IMAGE_DIR = path.join(PUBLIC_DIR, "images", "solar");
const LEGACY_SOLAR_IMAGE_DIR = path.join(PUBLIC_DIR, "image", "solar");
const WATERMARK_DIR = path.join(PREFERRED_SOLAR_IMAGE_DIR, "watermarked");
const WATERMARK_TEXT = "SunSweeper.com";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

const escapeSvgText = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const directoryExists = async (directoryPath) => {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

const resolveSolarImageDir = async () => {
  if (await directoryExists(PREFERRED_SOLAR_IMAGE_DIR)) {
    return PREFERRED_SOLAR_IMAGE_DIR;
  }

  if (await directoryExists(LEGACY_SOLAR_IMAGE_DIR)) {
    return LEGACY_SOLAR_IMAGE_DIR;
  }

  return null;
};

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
  console.log("[watermark] Starting solar image watermark generation...");
  console.log(`[watermark] Preferred source: ${PREFERRED_SOLAR_IMAGE_DIR}`);
  console.log(`[watermark] Legacy fallback source: ${LEGACY_SOLAR_IMAGE_DIR}`);

  const solarImageDir = await resolveSolarImageDir();
  if (!solarImageDir) {
    console.log("[watermark] No solar image source directory found. Skipping watermark generation.");
    return;
  }

  console.log(`[watermark] Using source directory: ${solarImageDir}`);
  console.log("[watermark] Loading sharp image processor...");
  const sharp = require("sharp");
  console.log("[watermark] Sharp loaded successfully.");

  await fs.mkdir(PREFERRED_SOLAR_IMAGE_DIR, { recursive: true });
  await fs.mkdir(WATERMARK_DIR, { recursive: true });
  console.log(`[watermark] Watermarked output directory ready: ${WATERMARK_DIR}`);

  const entries = await fs.readdir(solarImageDir, { withFileTypes: true });
  const imageFiles = entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (imageFiles.length === 0) {
    console.log(`[watermark] No .jpg, .jpeg, or .png files found in ${solarImageDir}.`);
    return;
  }

  console.log(`[watermark] Found ${imageFiles.length} solar image(s) to process.`);

  let writtenCount = 0;
  for (const fileName of imageFiles) {
    const inputPath = path.join(solarImageDir, fileName);
    const originalOutputPath = path.join(PREFERRED_SOLAR_IMAGE_DIR, fileName);
    const watermarkedOutputPath = path.join(WATERMARK_DIR, fileName);
    const image = sharp(inputPath).rotate();
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.warn(`[watermark] Skipping ${fileName}: unable to read image dimensions.`);
      continue;
    }

    if (solarImageDir !== PREFERRED_SOLAR_IMAGE_DIR) {
      await fs.copyFile(inputPath, originalOutputPath);
      console.log(`[watermark] Copied original fallback: public/images/solar/${fileName}`);
    }

    await image
      .composite([{ input: Buffer.from(createWatermarkSvg({ width: metadata.width, height: metadata.height })), top: 0, left: 0 }])
      .toFile(watermarkedOutputPath);

    writtenCount += 1;
    console.log(`[watermark] Watermarked ${fileName} -> public/images/solar/watermarked/${fileName}`);
  }

  console.log(`[watermark] Complete. Wrote ${writtenCount} watermarked image(s).`);
}

main().catch((error) => {
  console.error("[watermark] Failed to generate watermarked solar images:", error);
  process.exitCode = 1;
});
