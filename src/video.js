import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { buildArgs, formatSize, formatTime, parseLogTime, parseTime } from "./encode.js";

const $ = (id) => document.getElementById(id);
const IN_DIR = "/in";

let ffmpeg = null;
let file = null;
let duration = NaN;
let busy = false;
let previewURL = null;
let outputURL = null;
let onTime = null; // set during a run, fed by the ffmpeg log
let lastLog = "";

function setStatus(msg, isError = false) {
  $("status").textContent = msg;
  $("status").classList.toggle("error", isError);
}

function setProgress(ratio) {
  $("bar").hidden = ratio == null;
  $("progress").style.width = `${Math.round((ratio ?? 0) * 100)}%`;
}

function revoke(url) {
  if (url) URL.revokeObjectURL(url);
  return null;
}

async function getEngine() {
  if (ffmpeg?.loaded) return ffmpeg;
  setStatus("Loading FFmpeg engine (first time only)…");
  ffmpeg = new FFmpeg();
  // The log carries "time=" which works with -ss/-t; the built-in progress event does not.
  ffmpeg.on("log", ({ message }) => {
    if (message.trim()) lastLog = message.trim();
    const t = parseLogTime(message);
    if (t != null) onTime?.(t);
  });
  await ffmpeg.load({ coreURL, wasmURL });
  return ffmpeg;
}

function readDuration(url) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(v.duration);
    v.onerror = () => resolve(NaN);
    v.src = url;
  });
}

async function pickFile(f) {
  if (!f || busy) return;
  const looksLikeVideo = f.type.startsWith("video/") || /\.(mkv|mov|avi|flv|wmv|m4v|3gp)$/i.test(f.name);
  if (!looksLikeVideo) return setStatus("Please select a video file.", true);

  clearOutput();
  file = f;
  revoke(previewURL);
  previewURL = URL.createObjectURL(f);
  $("preview").src = previewURL;
  $("previewBox").classList.remove("hidden");
  duration = await readDuration(previewURL);

  const len = Number.isFinite(duration) ? formatTime(duration) : "unknown length";
  $("fileInfo").textContent = `${f.name} · ${formatSize(f.size)} · ${len}`;
  $("compress").disabled = false;
  // Suggest half the original size so the default does something useful.
  $("target").value = Math.max(1, Math.round(f.size / 1024 / 1024 / 2));
  setStatus(Number.isFinite(duration) ? "Video ready." : "Video ready, but its length is unknown. Preview may not play (e.g. MKV).");
}

function clearOutput() {
  outputURL = revoke(outputURL);
  $("output").removeAttribute("src");
  $("result").classList.add("hidden");
}

function setBusy(on) {
  busy = on;
  $("compress").disabled = on || !file;
  $("clear").disabled = on;
  $("cancel").classList.toggle("hidden", !on);
  document.querySelectorAll("#videoTool .panel select, #videoTool .panel input").forEach((el) => (el.disabled = on));
}

async function compress() {
  if (!file || busy) return;
  const format = $("format").value;
  const outName = `out.${format}`;

  let plan;
  try {
    plan = buildArgs({
      input: `${IN_DIR}/${file.name}`,
      output: outName,
      format,
      mode: $("mode").value,
      targetMB: $("target").value,
      crf: $("crf").value,
      resolution: $("resolution").value,
      fps: $("fps").value,
      audio: $("audio").value,
      speed: $("speed").value,
      start: parseTime($("start").value),
      end: parseTime($("end").value),
      duration,
    });
  } catch (err) {
    return setStatus(err.message, true);
  }

  setBusy(true);
  clearOutput();
  setProgress(0);
  let mounted = false;

  try {
    const ff = await getEngine();
    // WORKERFS reads the file lazily instead of copying it all into wasm memory.
    await ff.createDir(IN_DIR).catch(() => {});
    await ff.mount("WORKERFS", { files: [file] }, IN_DIR);
    mounted = true;

    const t0 = performance.now();
    onTime = (t) => {
      const ratio = Math.min(t / plan.clip, 0.99);
      const elapsed = (performance.now() - t0) / 1000;
      const eta = ratio > 0.02 ? elapsed / ratio - elapsed : NaN;
      setProgress(ratio);
      setStatus(`Compressing… ${Math.round(ratio * 100)}% · ${formatTime(eta)} left`);
    };
    setStatus(plan.warning ?? "Compressing… 0%");

    const code = await ff.exec(plan.args);
    if (code !== 0) throw new Error(`FFmpeg failed (${lastLog}). Try MP4, a lower resolution, or another file.`);

    const data = await ff.readFile(outName);
    await ff.deleteFile(outName);
    const blob = new Blob([data.buffer], { type: `video/${format}` });
    showResult(blob, format, (performance.now() - t0) / 1000);
  } catch (err) {
    // terminate() rejects the pending exec with this message.
    if (/terminate/i.test(err?.message)) setStatus("Cancelled.");
    else {
      setStatus(`Error: ${err?.message ?? err}`, true);
      // A wasm crash leaves the engine unusable; start fresh next run.
      ffmpeg?.terminate();
      ffmpeg = null;
    }
    setProgress(null);
  } finally {
    onTime = null;
    if (mounted && ffmpeg?.loaded) await ffmpeg.unmount(IN_DIR).catch(() => {});
    setBusy(false);
  }
}

function showResult(blob, format, seconds) {
  outputURL = URL.createObjectURL(blob);
  const saved = (1 - blob.size / file.size) * 100;
  $("output").src = outputURL;
  $("download").href = outputURL;
  $("download").download = `${file.name.replace(/\.[^.]+$/, "")}-compressed.${format}`;
  $("download").textContent = `Download (${formatSize(blob.size)})`;
  $("stats").innerHTML = `
    <div><b>${formatSize(file.size)}</b><span>Original</span></div>
    <div><b>${formatSize(blob.size)}</b><span>Compressed</span></div>
    <div><b>${saved >= 0 ? `${saved.toFixed(0)}% smaller` : `${(-saved).toFixed(0)}% bigger`}</b><span>in ${formatTime(seconds)}</span></div>`;
  $("result").classList.remove("hidden");
  setProgress(1);
  setStatus(saved < 0 ? "Done, but the output is bigger. Try a lower resolution or a smaller target." : "Done.");
}

function cancel() {
  if (!busy || !ffmpeg) return;
  ffmpeg.terminate(); // kills the worker; next run reloads the engine
  ffmpeg = null;
}

function clearAll() {
  if (busy) return;
  clearOutput();
  previewURL = revoke(previewURL);
  $("preview").removeAttribute("src");
  $("previewBox").classList.add("hidden");
  $("file").value = "";
  $("start").value = $("end").value = "";
  file = null;
  duration = NaN;
  $("compress").disabled = true;
  setProgress(null);
  setStatus("Choose a video to begin.");
}

function syncMode() {
  const mode = $("mode").value;
  document.querySelectorAll("#videoTool [data-mode]").forEach((el) => (el.hidden = el.dataset.mode !== mode));
}

// Wiring
const drop = $("drop");
$("file").addEventListener("change", (e) => {
  pickFile(e.target.files[0]);
  e.target.value = ""; // allow picking the same file again
});
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  pickFile(e.dataTransfer.files[0]);
});
// Dropping outside the zone should not navigate away and lose work.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

$("mode").addEventListener("change", syncMode);
document.querySelectorAll("[data-mb]").forEach((b) =>
  b.addEventListener("click", () => ($("target").value = b.dataset.mb)),
);
$("compress").addEventListener("click", compress);
$("cancel").addEventListener("click", cancel);
$("clear").addEventListener("click", clearAll);
window.addEventListener("beforeunload", (e) => busy && e.preventDefault());
syncMode();
