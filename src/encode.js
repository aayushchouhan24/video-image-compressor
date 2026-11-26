// Pure helpers: no DOM, no ffmpeg. Tested in encode.test.js.

export const MB = 1024 * 1024;

export function formatSize(bytes) {
  return bytes < MB ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / MB).toFixed(2)} MB`;
}

export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:23.5", "83.5" or "" -> seconds (NaN when invalid, null when empty). */
export function parseTime(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Reads "time=00:01:02.50" from an ffmpeg log line. */
export function parseLogTime(line) {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
}

const SPEED = {
  // [x264 preset, vp9 deadline, vp9 cpu-used]
  fast: ["ultrafast", "realtime", "8"],
  balanced: ["veryfast", "realtime", "6"],
  small: ["medium", "good", "4"],
};

/**
 * Builds ffmpeg args. Throws Error with a user-facing message on bad input.
 * opts: { input, output, format, mode, targetMB, crf, resolution, fps, audio, speed, start, end, duration }
 */
export function buildArgs(o) {
  const start = o.start ?? 0;
  const end = o.end ?? o.duration;
  if (!Number.isFinite(o.duration) || o.duration <= 0) throw new Error("Could not read video duration.");
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error("Trim times must look like 75 or 1:15.");
  if (start < 0 || end > o.duration + 0.5 || end - start <= 0.1)
    throw new Error("Trim range is outside the video or too short.");
  const clip = end - start;

  const webm = o.format === "webm";
  const audioBps = o.audio === "none" ? 0 : parseInt(o.audio, 10) * 1000;
  const args = [];

  if (start > 0) args.push("-ss", String(start));
  args.push("-i", o.input);
  if (o.end != null || start > 0) args.push("-t", String(clip));
  args.push("-map", "0:v:0", "-map", "0:a:0?");

  const filters = [];
  const r = Number(o.resolution);
  if (r > 0) {
    // Resolution means the short side (1080p), and never upscale.
    filters.push(
      `scale='if(gte(iw,ih),-2,trunc(min(${r},iw)/2)*2)':'if(gte(iw,ih),trunc(min(${r},ih)/2)*2,-2)'`,
    );
  }
  if (Number(o.fps) > 0) filters.push(`fps=${o.fps}`);
  if (filters.length) args.push("-vf", filters.join(","));

  const [x264Preset, vp9Deadline, vp9Cpu] = SPEED[o.speed] ?? SPEED.balanced;
  // shortcut: VP8, since libvpx-vp9 crashes ffmpeg.wasm core 0.12.x ("memory access out of bounds"); retry VP9 on a newer core.
  args.push("-c:v", webm ? "libvpx" : "libx264");
  if (webm) args.push("-deadline", vp9Deadline, "-cpu-used", vp9Cpu);
  else args.push("-preset", x264Preset);

  let videoBps = null;
  let warning = null;
  if (o.mode === "target") {
    const targetBytes = Number(o.targetMB) * MB;
    if (!(targetBytes > 0)) throw new Error("Target size must be above 0 MB.");
    // Leave ~7% for container overhead and rate-control overshoot so the result lands under the target.
    videoBps = Math.floor((targetBytes * 8 * 0.93) / clip - audioBps);
    if (videoBps < 50_000) {
      videoBps = 50_000;
      warning = "Target is very small for this length, so the file may come out larger and look rough.";
    }
    const k = Math.floor(videoBps / 1000);
    args.push("-b:v", `${k}k`, "-maxrate", `${k}k`, "-bufsize", `${k}k`);
  } else {
    args.push("-crf", String(o.crf));
    if (webm) args.push("-b:v", "0");
  }
  args.push("-pix_fmt", "yuv420p");

  if (o.audio === "none") args.push("-an");
  // libvorbis, since libopus crashes ffmpeg.wasm 0.12 on stereo input ("memory access out of bounds").
  else args.push("-c:a", webm ? "libvorbis" : "aac", "-b:a", o.audio);
  // Vorbis cannot do stereo at 32k; mono is fine for the "voice" setting.
  if (audioBps && audioBps <= 32000) args.push("-ac", "1");

  if (!webm) args.push("-movflags", "+faststart");
  args.push("-y", o.output);

  return { args, clip, videoBps, warning };
}
