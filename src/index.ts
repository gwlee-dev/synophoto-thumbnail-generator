import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import SUPPORTED from "./config/supported.json";
import THUMB_SIZES from "./config/thumb-sizes.json";

const ROOT_DIR = "./data";

interface Thumbnail {
  size: string;
  width: number;
}

const FILE_TYPES = SUPPORTED.images.concat(SUPPORTED.videos);

async function generateThumbnails(filePath: string): Promise<void> {
  const baseName = path.basename(filePath);
  const ext = baseName.split(".").pop()?.toLowerCase() || "";
  const fileDir = path.dirname(filePath);
  const eaDir = path.join(fileDir, "@eaDir", baseName);

  if (!fs.existsSync(eaDir))
    await fs.promises.mkdir(eaDir, { recursive: true });

  for (const thumb of THUMB_SIZES) {
    const thumbPath = path.join(eaDir, `SYNOPHOTO_THUMB_${thumb.size}.jpg`);

    if (
      await fs.promises
        .access(thumbPath)
        .then(() => true)
        .catch(() => false)
    ) {
      console.log(
        `Skipping thumbnail: ${thumb.size} for ${filePath} (already exists)`
      );
      continue;
    }

    if (SUPPORTED.images.includes(ext)) {
      await generateImageThumbnail(filePath, thumb, thumbPath);
    } else if (SUPPORTED.videos.includes(ext)) {
      await generateVideoThumbnail(filePath, thumb, thumbPath);
    }
  }
}

async function generateImageThumbnail(
  filePath: string,
  thumb: Thumbnail,
  thumbPath: string
): Promise<void> {
  try {
    await sharp(filePath).resize(thumb.width).toFile(thumbPath);
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
    ffmpeg(filePath)
      .outputOptions("-vf", `scale=${thumb.width}:-1`, "-vframes", "1")
      .output(thumbPath)
      .on("end", () => resolve())
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

async function walkDir(dir: string): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !fullPath.includes("@eaDir")) {
      await walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!FILE_TYPES.includes(ext)) continue;

      console.log(`Generating thumbnail: ${fullPath}`);
      await generateThumbnails(fullPath);
    }
  }
}

walkDir(ROOT_DIR).catch((err) => {
  console.error("Error walking through directory", err);
});
