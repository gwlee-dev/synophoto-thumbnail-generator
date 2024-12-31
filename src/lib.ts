import Ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import sharp from "sharp";
import { Thumbnail } from "./types";

export async function convertImage(
  filePath: string,
  thumb: Thumbnail,
  thumbPath: string
): Promise<void> {
  try {
    await sharp(filePath)
      .resize(thumb.width)
      .toFile(thumbPath, (err, info) => {
        if (err) {
          console.error("Error converting file:", err);
        }
      });
  } catch (err) {
    await fs.promises.appendFile(
      "error.log",
      `Error generating thumbnail for image: ${filePath}\n`
    );
  }
}

export async function captureFrame(
  filePath: string,
  thumb: Thumbnail,
  thumbPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    Ffmpeg(filePath)
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
