import fs from "fs";
import path from "path";
import SUPPORTED from "./config/supported.json";
import _THUMB_SIZES from "./config/thumb-sizes.json";
import { captureFrame, convertImage } from "./lib";
import type { Thumbnail } from "./types";

const ROOT_DIR = "./data";

const THUMB_SIZES: Thumbnail[] = _THUMB_SIZES.sort((a, b) => b.width - a.width);
const FILE_TYPES = SUPPORTED.images.concat(SUPPORTED.videos);

async function generateThumbnails(filePath: string): Promise<void> {
  const baseName = path.basename(filePath);
  const ext = baseName.split(".").pop()?.toLowerCase() || "";
  const fileDir = path.dirname(filePath);
  const eaDir = path.join(fileDir, "@eaDir", baseName);

  if (!fs.existsSync(eaDir))
    await fs.promises.mkdir(eaDir, { recursive: true });

  if (SUPPORTED.images.includes(ext)) {
    await getImageThumbnail(eaDir, filePath);
  } else if (SUPPORTED.videos.includes(ext)) {
    await getVideoThumbnail(eaDir, filePath);
  }
}

async function getImageThumbnail(eaDir: string, filePath: string) {
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

    await convertImage(filePath, thumb, thumbPath);
  }
}

async function getVideoThumbnail(eaDir: string, filePath: string) {
  let framePath;
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

    if (framePath) {
      await convertImage(framePath, thumb, thumbPath);
    } else {
      await captureFrame(filePath, thumb, thumbPath);
      framePath = thumbPath;
    }
  }
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
