import { formatSize } from "./encode.js";

const $ = (id) => document.getElementById(id);
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp|tiff?|ico)$/i;
const EXT = { "image/webp": "webp", "image/jpeg": "jpg" };

let queue = [];
let urls = [];
let busy = false;
let worker = null;
let nextId = 0;
const pending = new Map();

function setStatus(msg) {
  $("imgStatus").textContent = msg;
}

// One worker, reused: decoding and encoding stay off the main thread so the page never freezes.
function compressInWorker(file, opts) {
  worker ??= new Worker(new URL("./image.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, file, opts });
  });
}

export function addImages(list) {
  const imgs = Array.from(list).filter((f) => f.type.startsWith("image/") || IMAGE_EXT.test(f.name));
  if (!imgs.length) return setStatus("No images found in that selection.");
  queue.push(...imgs);
  const total = queue.reduce((s, f) => s + f.size, 0);
  $("imgCompress").disabled = busy;
  setStatus(`${queue.length} image(s) ready · ${formatSize(total)} total.`);
}

function clearImages() {
  if (busy) return;
  queue = [];
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $("imgFiles").value = "";
  $("imgResults").innerHTML = "";
  $("imgDownloadAll").classList.add("hidden");
  $("imgCompress").disabled = true;
  $("imgProgress").style.width = "0";
  setStatus("Choose one or more images to begin.");
}

function resultRow(file, r, name) {
  const url = URL.createObjectURL(r.blob);
  urls.push(url);
  const saved = (1 - r.blob.size / file.size) * 100;
  const row = document.createElement("div");
  row.className = "item";
  row.innerHTML = `
    <img src="${url}" alt="" loading="lazy">
    <div class="info"><b></b><span class="meta"></span></div>
    <a class="button" download>Download</a>`;
  row.querySelector("b").textContent = name;
  row.querySelector(".meta").textContent =
    `${formatSize(file.size)} → ${formatSize(r.blob.size)} · ` +
    (saved >= 0 ? `${saved.toFixed(0)}% smaller` : `${(-saved).toFixed(0)}% bigger, keep the original`) +
    ` · ${r.width}×${r.height}`;
  const a = row.querySelector("a");
  a.href = url;
  a.download = name;
  return row;
}

function errorRow(file, msg) {
  const row = document.createElement("div");
  row.className = "item error";
  row.textContent = `${file.name}: ${msg}`;
  return row;
}

async function compressAll() {
  if (busy || !queue.length) return;
  busy = true;
  $("imgCompress").disabled = $("imgClear").disabled = true;
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  $("imgResults").innerHTML = "";
  $("imgDownloadAll").classList.add("hidden");

  const type = $("imgFormat").value;
  const opts = {
    type,
    target: Math.max(5, Number($("imgTarget").value) || 500) * 1024,
    maxDim: Number($("imgMaxDim").value),
    minQ: Number($("imgFloor").value),
  };
  const list = [...queue];
  let done = 0;
  let failed = 0;
  let before = 0;
  let after = 0;

  for (const [i, file] of list.entries()) {
    setStatus(`Compressing ${i + 1} of ${list.length}: ${file.name}`);
    const r = await compressInWorker(file, opts);
    if (r.error) {
      failed++;
      $("imgResults").append(errorRow(file, /decode|source image/i.test(r.error) ? "This browser cannot read this image format." : r.error));
    } else {
      done++;
      before += file.size;
      after += r.blob.size;
      const name = `${file.name.replace(/\.[^.]+$/, "")}-smashed.${EXT[type]}`;
      $("imgResults").append(resultRow(file, r, name));
    }
    $("imgProgress").style.width = `${((i + 1) / list.length) * 100}%`;
  }

  const summary = done ? ` · ${formatSize(before)} → ${formatSize(after)}` : "";
  setStatus(`Finished: ${done} compressed, ${failed} failed${summary}.`);
  $("imgDownloadAll").classList.toggle("hidden", done < 2);
  busy = false;
  $("imgCompress").disabled = $("imgClear").disabled = false;
}

function downloadAll() {
  // Browsers may ask once to allow multiple downloads.
  $("imgResults").querySelectorAll("a[download]").forEach((a) => a.click());
}

const drop = $("imgDrop");
$("imgFiles").addEventListener("change", (e) => addImages(e.target.files));
drop.addEventListener("dragover", (e) => {
  e.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  addImages(e.dataTransfer.files);
});
$("imgCompress").addEventListener("click", compressAll);
$("imgClear").addEventListener("click", clearImages);
$("imgDownloadAll").addEventListener("click", downloadAll);
document.querySelectorAll("[data-kb]").forEach((b) =>
  b.addEventListener("click", () => ($("imgTarget").value = b.dataset.kb)),
);
window.addEventListener("beforeunload", (e) => busy && e.preventDefault());
