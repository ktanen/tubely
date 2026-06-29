import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { Buffer } from "buffer";


export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const formData = await req.formData();

  const thumbnail = formData.get("thumbnail");

  if (!(thumbnail instanceof File)) {
    throw new BadRequestError("Missing thumbnail file");
  }

    const MAX_UPLOAD_SIZE = 10 << 20;

    if (thumbnail.size > MAX_UPLOAD_SIZE) {
      throw new BadRequestError("Thumbnail file too large; must be 10MB or smaller");
    }

    const fileType = thumbnail.type;
    const imageData = await thumbnail.arrayBuffer();
    const buffer = Buffer.from(imageData);
    const imageDataString = buffer.toString("base64");

    const db = cfg.db
    const video = getVideo(db, videoId);

    if (!video) {
      throw new NotFoundError("Couldn't find video");
    }
    if (video.userID !== userID) {
      throw new UserForbiddenError("Not authorized to update this video");
    }

    const thumbnailURL = `data: ${fileType};base64,${imageDataString}`;

    const thumbnailData = {
      data: imageData,
      mediaType: fileType
    };


    video.thumbnailURL = thumbnailURL;

    await updateVideo(db, video);


    

  return respondWithJSON(200, video);
}
