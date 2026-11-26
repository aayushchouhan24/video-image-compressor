import test from "node:test";
import assert from "node:assert/strict";
import { buildArgs, parseTime, parseLogTime, formatSize } from "./encode.js";

const base = {
  input: "/in/a.mp4", output: "out.mp4", format: "mp4", mode: "target", targetMB: 10,
  crf: 28, resolution: 1080, fps: 30, audio: "96k", speed: "balanced", duration: 100,
};

test("target mode budgets bitrate under target", () => {
  const { args, videoBps } = buildArgs(base);
  // 10 MB * 8 * 0.93 / 100s - 96k audio
  assert.equal(videoBps, Math.floor((10 * 1024 * 1024 * 8 * 0.93) / 100 - 96000));
  assert.ok(args.includes("-b:v") && !args.includes("-crf"));
  assert.ok(args.includes("+faststart"));
});

test("trim changes clip length and bitrate", () => {
  const { args, clip } = buildArgs({ ...base, start: 10, end: 30 });
  assert.equal(clip, 20);
  assert.deepEqual(args.slice(0, 2), ["-ss", "10"]);
  assert.equal(args[args.indexOf("-t") + 1], "20");
});

test("webm quality mode uses vp8 crf without x264 preset", () => {
  const { args } = buildArgs({ ...base, format: "webm", mode: "quality", output: "out.webm" });
  assert.ok(args.includes("libvpx") && args.includes("libopus"));
  assert.ok(!args.includes("-preset") && !args.includes("-movflags"));
  assert.equal(args[args.indexOf("-b:v") + 1], "0");
});

test("rejects bad input", () => {
  assert.throws(() => buildArgs({ ...base, duration: NaN }), /duration/);
  assert.throws(() => buildArgs({ ...base, targetMB: 0 }), /Target/);
  assert.throws(() => buildArgs({ ...base, start: 50, end: 40 }), /Trim/);
  assert.equal(buildArgs({ ...base, targetMB: 0.01 }).warning !== null, true);
});

test("parsers", () => {
  assert.equal(parseTime("1:15"), 75);
  assert.equal(parseTime(""), null);
  assert.ok(Number.isNaN(parseTime("abc")));
  assert.equal(parseLogTime("frame=10 time=00:01:02.50 bitrate"), 62.5);
  assert.equal(formatSize(2 * 1024 * 1024), "2.00 MB");
});
