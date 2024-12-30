const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const heicConvert = require("heic-convert");

const ROOT_DIR = "./data";
console.log(`ROOT_DIR is set to: ${ROOT_DIR}`);

const THUMB_SIZES = [
  { size: "SM", width: 240 },
  { size: "M", width: 320 },
  { size: "XL", width: 1280 },
];
const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "heic", "png"];
const SUPPORTED_VIDEO_EXTENSIONS = ["mov"];
const FILE_TYPES = ["jpg", "heic", "mov", "png"];

async function convertHeicToJpg(heicFilePath) {
  const buffer = fs.readFileSync(heicFilePath);
  const outputBuffer = await heicConvert({
    buffer: buffer,
    format: "JPEG",
    quality: 1,
  });

  const outputFilePath = path.join(
    path.dirname(heicFilePath),
    `${path.basename(heicFilePath, ".HEIC")}.jpg`
  );
  fs.writeFileSync(outputFilePath, outputBuffer);
  console.log(`Converted HEIC to JPG: ${outputFilePath}`);
  return outputFilePath;
}

async function generateThumbnails(filePath) {
  const baseName = path.basename(filePath);
  const ext = baseName.split(".").pop().toLowerCase();
  const fileDir = path.dirname(filePath);
  const eaDir = path.join(fileDir, "@eaDir", baseName);
  const target = ext === "heic" ? await convertHeicToJpg(filePath) : filePath;

  if (!fs.existsSync(eaDir)) fs.mkdirSync(eaDir, { recursive: true });

  for await (const thumb of THUMB_SIZES) {
    const thumbPath = path.join(eaDir, `SYNOPHOTO_THUMB_${thumb.size}.jpg`);

    if (fs.existsSync(thumbPath)) {
      console.log(`Thumbnail already exists: ${thumbPath}`);
      continue;
    }

    if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      await generateImageThumbnail(target, thumb, thumbPath);
      continue;
    }

    if (SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
      await generateVideoThumbnail(target, thumb, thumbPath);
      continue;
    }

    console.log(`Unsupported file type: ${target}`);
  }

  if (ext === "heic") fs.unlinkSync(target);
}

async function generateImageThumbnail(filePath, thumb, thumbPath) {
  try {
    await sharp(filePath).resize(thumb.width).toFile(thumbPath);
    console.log(`Generated thumbnail: ${thumbPath}`);
  } catch (err) {
    console.error(`Error generating thumbnail for image: ${filePath}`, err);
    fs.appendFileSync(
      "error_log.txt",
      `Error generating thumbnail for image: ${filePath}\n`
    );
  }
}

async function generateVideoThumbnail(filePath, thumb, thumbPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .outputOptions("-vf", `scale=${thumb.width}:-1`, "-vframes", 1)
      .output(thumbPath)
      .on("end", () => {
        console.log(`Generated thumbnail: ${thumbPath}`);
        resolve();
      })
      .on("error", (err) => {
        console.error(`Error generating thumbnail for video: ${filePath}`, err);
        fs.appendFileSync(
          "error_log.txt",
          `Error generating thumbnail for video: ${filePath}\n`
        );
        reject(err);
      })
      .run();
  });
}

console.log(`Starting search in: ${ROOT_DIR}`);

async function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !fullPath.includes("@eaDir")) {
      await walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!FILE_TYPES.includes(ext)) continue;

      console.log(`Processing file: ${fullPath}`);

      await generateThumbnails(fullPath);
      console.log(`Generated thumbnails for: ${fullPath}`);
    }
  }
}

walkDir(ROOT_DIR).catch((err) => {
  console.error("Error walking through directory", err);
});
