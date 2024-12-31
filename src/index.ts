import fs from "fs";
import path from "path";
import SUPPORTED from "./config/supported.json";
import _THUMB_SIZES from "./config/thumb-sizes.json";
import { captureFrame, convertImage } from "./lib";
import type { Thumbnail } from "./types";

const ROOT_DIR = "./data";
const LOG_DIR = "./logs";
const THUMB_SIZES: Thumbnail[] = _THUMB_SIZES.sort((a, b) => b.width - a.width);
const FILE_TYPES = SUPPORTED.images.concat(SUPPORTED.videos);

const getLogger = (filename: string) => async (message: string) => {
  const logDirPath = path.join(LOG_DIR);

  if (!fs.existsSync(logDirPath)) {
    await fs.promises.mkdir(logDirPath, { recursive: true });
  }

  const logFilePath = path.join(logDirPath, filename);
  const log = `[${new Date().toISOString()}] ${message}\n`;
  console.log(message);
  await fs.promises.appendFile(logFilePath, log);
};
const logger = {
  info: getLogger("process.log"),
  error: getLogger("error.log"),
};

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
      await logger.info(
        `Skipping thumbnail: ${thumb.size} for ${filePath} (already exists)`
      );
      continue;
    }

    try {
      await convertImage(filePath, thumb, thumbPath);
      await logger.info(`Generated thumbnail: ${thumb.size} for ${filePath}`);
    } catch (err) {
      if (err instanceof Error)
        await logger.error(
          `Error generating thumbnail for ${filePath}: ${err.message}`
        );
      else throw err;
    }
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
      await logger.info(
        `Skipping thumbnail: ${thumb.size} for ${filePath} (already exists)`
      );
      continue;
    }

    try {
      if (framePath) {
        await convertImage(framePath, thumb, thumbPath);
      } else {
        await captureFrame(filePath, thumb, thumbPath);
        framePath = thumbPath;
      }
      await logger.info(`Generated thumbnail: ${thumb.size} for ${filePath}`);
    } catch (err) {
      if (err instanceof Error)
        await logger.error(
          `Error generating thumbnail for ${filePath}: ${err.message}`
        );
      else throw err;
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

      await logger.info(`Generating thumbnail: ${fullPath}`);
      try {
        await generateThumbnails(fullPath);
      } catch (err) {
        if (err instanceof Error)
          await logger.error(
            `Error processing file ${fullPath}: ${err.message}`
          );
        else throw err;
      }
    }
  }
}

walkDir(ROOT_DIR).catch(async (err) => {
  await logger.error(`Error walking through directory: ${err.message}`);
});
