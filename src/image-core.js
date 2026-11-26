// Image compression that runs inside a worker (OffscreenCanvas). findQuality is pure and tested.

/**
 * Binary-searches encoder quality. encode(q) -> Promise<Blob>.
 * Returns the highest-quality blob at or under target, else the smallest blob seen.
 */
export async function findQuality(encode, target, minQ, maxQ = 0.92, steps = 7) {
  const top = await encode(maxQ);
  if (top.size <= target) return top;
  let smallest = top;
  let fit = null;
  let lo = minQ;
  let hi = maxQ;
  for (let i = 0; i < steps; i++) {
    const q = (lo + hi) / 2;
    const b = await encode(q);
    if (b.size < smallest.size) smallest = b;
    if (b.size > target) hi = q;
    else {
      lo = q;
      fit = b;
    }
  }
  if (fit) return fit;
  const floor = await encode(minQ);
  return floor.size < smallest.size ? floor : smallest;
}

const MIN_SIDE = 320;

/** opts: { type, target (bytes), maxDim (0 = original), minQ } */
export async function compressImage(file, { type, target, maxDim, minQ }) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const longest = Math.max(bmp.width, bmp.height);
    let scale = maxDim > 0 ? Math.min(1, maxDim / longest) : 1;
    let best = null;

    // Lower quality first; if the floor is still too big, shrink dimensions and retry.
    for (let pass = 0; pass < 12; pass++) {
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      // JPEG has no alpha: paint white so transparent areas do not turn black.
      if (type === "image/jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, w, h);

      const blob = await findQuality((quality) => canvas.convertToBlob({ type, quality }), target, minQ);
      if (blob.type !== type) throw new Error(`This browser cannot encode ${type.split("/")[1].toUpperCase()}. Pick another format.`);
      if (!best || blob.size < best.blob.size) best = { blob, width: w, height: h };
      if (blob.size <= target || Math.max(w, h) <= MIN_SIDE) break;
      scale *= 0.82;
    }
    return best;
  } finally {
    bmp.close();
  }
}
