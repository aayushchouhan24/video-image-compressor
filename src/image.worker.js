import { compressImage } from "./image-core.js";

self.onmessage = async ({ data: { id, file, opts } }) => {
  try {
    const r = await compressImage(file, opts);
    self.postMessage({ id, ...r });
  } catch (err) {
    self.postMessage({ id, error: err?.message ?? String(err) });
  }
};
