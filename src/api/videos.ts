import { respondWithJSON } from "./json";
import { getBearerToken, validateJWT } from "../auth";
import { type ApiConfig } from "../config";
import { type BunRequest } from "bun";
import { BadRequestError, UserForbiddenError, NotFoundError } from "./errors";
import { getVideo, updateVideo } from "../db/videos";
import path from "path";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {

  const MAX_UPLOAD_SIZE = 1 << 30 // 1GB

  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  const db = cfg.db
  const video = getVideo(db, videoId);

  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("Not authorized to update this video");
  }
  
  const formData = await req.formData();

  const videoFile = formData.get("video");


  if (!(videoFile instanceof File)) {
    throw new BadRequestError("Missing video file");
  }

  if (videoFile.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Video file too large; must be 1GB or smaller");
  }

  const fileType = videoFile.type;

  if (fileType !== "video/mp4") {
    throw new BadRequestError("Videos must be MP4s");
  }

const videoID = video.id;




const filename = `${videoID}.mp4`

const tempFilePath = path.join("/tmp", filename);


await Bun.write(tempFilePath, videoFile);


const aspectRatio = await getVideoAspectRatio(tempFilePath);

const fileKey = `${aspectRatio}/${filename}`;

const s3File = cfg.s3Client.file(fileKey, {type: fileType});

await Bun.write(s3File, Bun.file(tempFilePath));  

const videoURL = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${fileKey}`;

  video.videoURL = videoURL;

  await updateVideo(db, video);

  await Bun.file(tempFilePath).delete();

  return respondWithJSON(200, video);
}

export async function getVideoAspectRatio(filePath: string): Promise<string> {
  const proc = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "v:0", 
    "-show_entries", "stream=width,height", "-of", "json", filePath], 
  {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutText = await new Response(proc.stdout).text();
  const stderrText = await new Response(proc.stderr).text();

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe failed: ${stderrText}`);
  }

  const streamsJSON = JSON.parse(stdoutText);

  const width = streamsJSON.streams[0].width;
  const height = streamsJSON.streams[0].height;

  const isLandscape = (width === Math.round(16 * (height / 9)));
  const isPortrait = (width === Math.round(9 * (height / 16)));

  const aspectRatio = isLandscape ? "landscape" : isPortrait ? "portrait" : "other";

  return aspectRatio;


}