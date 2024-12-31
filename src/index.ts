import fs from "fs";
import path from "path";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import SUPPORTED from "./config/supported.json";
import _THUMB_SIZES from "./config/thumb-sizes.json";
import { captureFrame, convertImage } from "./lib";
import Bottleneck from "bottleneck";
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

const limiter = new Bottleneck({
  maxConcurrent: parseInt(process.env.MAX_CONCURRENT || "5"),
  minTime: 200,
});

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
  const promises = THUMB_SIZES.map((thumb) => {
    const thumbPath = path.join(eaDir, `SYNOPHOTO_THUMB_${thumb.size}.jpg`);

    return fs.promises
      .access(thumbPath)
      .then(() => true)
      .catch(() => false)
      .then((exists) => {
        if (exists) {
          return;
        }

        return convertImage(filePath, thumb, thumbPath).catch((err) => {
          if (err instanceof Error) {
            return logger.error(
              `Error generating thumbnail for ${filePath}: ${err.message}. Thumbnail path: ${thumbPath}`
            );
          }
          throw err;
        });
      });
  });

  await Promise.all(promises);
}

async function getVideoThumbnail(eaDir: string, filePath: string) {
  const firstThumb = THUMB_SIZES[0];
  const firstThumbPath = path.join(
    eaDir,
    `SYNOPHOTO_THUMB_${firstThumb.size}.jpg`
  );

  if (!fs.existsSync(firstThumbPath)) {
    try {
      await captureFrame(filePath, firstThumb, firstThumbPath);
    } catch (err) {
      if (err instanceof Error)
        await logger.error(
          `Error generating first thumbnail for ${filePath}: ${err.message}. Thumbnail path: ${firstThumbPath}`
        );
      return;
    }
  }

  const generatePromises = THUMB_SIZES.slice(1).map((thumb) => {
    const thumbPath = path.join(eaDir, `SYNOPHOTO_THUMB_${thumb.size}.jpg`);
    if (!fs.existsSync(thumbPath)) {
      return convertImage(firstThumbPath, thumb, thumbPath).catch((err) =>
        logger.error(
          `Error generating thumbnail for ${filePath}: ${err.message}. Thumbnail path: ${thumbPath}`
        )
      );
    }
  });

  await Promise.all(generatePromises);
}

function generateThumbnailsInWorker(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { filePath },
    });

    worker.on("message", (message) => {
      if (message.status === "success") {
        resolve();
      }
    });

    worker.on("error", (error) => {
      reject(error);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
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

      try {
        await limiter.schedule(() => generateThumbnailsInWorker(fullPath));
        await logger.info(`Successfully processed: ${fullPath}`);
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

if (isMainThread) {
  walkDir(ROOT_DIR).catch(async (err) => {
    await logger.error(`Error walking through directory: ${err.message}`);
  });
} else {
  const { filePath } = workerData;
  generateThumbnails(filePath)
    .then(() => {
      parentPort?.postMessage({ status: "success" });
    })
    .catch((err) => {
      parentPort?.postMessage({ status: "error", error: err.message });
    });
}
