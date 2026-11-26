import test from "node:test";
import assert from "node:assert/strict";
import { findQuality } from "./image-core.js";

// Fake encoder: size grows linearly with quality.
const enc = (q) => Promise.resolve({ size: Math.round(q * 1000), q });

test("returns top quality when already under target", async () => {
  assert.equal((await findQuality(enc, 2000, 0.2)).q, 0.92);
});

test("finds highest quality under target", async () => {
  const b = await findQuality(enc, 500, 0.2);
  assert.ok(b.size <= 500 && b.size > 480, `got ${b.size}`);
});

test("returns smallest when target unreachable", async () => {
  const b = await findQuality(enc, 50, 0.2);
  assert.equal(b.q, 0.2);
});
