import fs from "fs";
import path from "path";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import heicConvert from "heic-convert";
import { v4 } from "uuid";

const ROOT_DIR = ".";
const DATA_DIR = path.join(ROOT_DIR, "data");
const TEMP_DIR = path.join(ROOT_DIR, "temp");

interface Thumbnail {
  size: string;
  width: number;
}

const THUMB_SIZES: Thumbnail[] = [
  { size: "SM", width: 240 },
  { size: "M", width: 320 },
  { size: "XL", width: 1280 },
];

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "heic", "png"];
const SUPPORTED_VIDEO_EXTENSIONS = ["mov"];
const FILE_TYPES = ["jpg", "heic", "mov", "png"];

async function ensureTempDirExists(): Promise<void> {
  if (!fs.existsSync(TEMP_DIR)) {
    await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  }
}

async function convertHeicToJpg(heicFilePath: string): Promise<string> {
  await ensureTempDirExists();

  const buffer = await fs.promises.readFile(heicFilePath);
  const outputBuffer = await heicConvert({
    buffer: buffer,
    format: "JPEG",
    quality: 1,
  });

  const outputFilePath = path.join(TEMP_DIR, `${v4()}.jpg`);
  await fs.promises.writeFile(outputFilePath, Buffer.from(outputBuffer));
  return outputFilePath;
}

async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    console.error(`Error deleting file: ${filePath}`, error.message);
  }
}

async function generateThumbnails(filePath: string): Promise<void> {
  const baseName = path.basename(filePath);
  const ext = baseName.split(".").pop()?.toLowerCase();
  const fileDir = path.dirname(filePath);
  const eaDir = path.join(fileDir, "@eaDir", baseName);
  const isHeic = ext === "heic";
  const target = isHeic ? await convertHeicToJpg(filePath) : filePath;

  if (!fs.existsSync(eaDir)) await fs.promises.mkdir(eaDir, { recursive: true });

  try {
    for (const thumb of THUMB_SIZES) {
      const thumbPath = path.join(eaDir, `SYNOPHOTO_THUMB_${thumb.size}.jpg`);

      if (await fs.promises.access(thumbPath).then(() => true).catch(() => false)) {
        console.log(`Skipping thumbnail: ${thumb.size} for ${filePath} (already exists)`);
        continue;
      }

      if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext || "")) {
        await generateImageThumbnail(target, thumb, thumbPath);
      } else if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext || "")) {
        await generateVideoThumbnail(target, thumb, thumbPath);
      }
    }
  } finally {
    if (isHeic) await deleteFile(target);
  }
}

async function generateImageThumbnail(
  filePath: string,
  thumb: Thumbnail,
  thumbPath: string
): Promise<void> {
  try {
    console.log(`Generating image thumbnail: ${thumb.size} for ${filePath}`);
    await sharp(filePath).resize(thumb.width).toFile(thumbPath);
    console.log(`Thumbnail generated: ${thumbPath}`);
  } catch (err) {
    await fs.promises.appendFile(
      "error.log",
      `Error generating thumbnail for image: ${filePath}\n`
    );
  }
}

async function generateVideoThumbnail(
  filePath: string,
  thumb: Thumbnail,
  thumbPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Generating video thumbnail: ${thumb.size} for ${filePath}`);
    ffmpeg(filePath)
      .outputOptions("-vf", `scale=${thumb.width}:-1`, "-vframes", "1")
      .output(thumbPath)
      .on("end", () => {
        console.log(`Thumbnail generated: ${thumbPath}`);
        resolve();
      })
      .on("error", (err) => {
        fs.promises.appendFile(
          "error.log",
          `Error generating thumbnail for video: ${filePath}\n`
        );
        reject(err);
      })
      .run();
  });
}

async function walkDir(dir = DATA_DIR): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !fullPath.includes("@eaDir")) {
      await walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!FILE_TYPES.includes(ext)) continue;

      await generateThumbnails(fullPath);
    }
  }
}

walkDir().catch((err) => {
  console.error("Error walking through directory", err);
});
