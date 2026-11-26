import { defineConfig } from "vite";

export default defineConfig({
  // ffmpeg.wasm spawns its own worker; pre-bundling breaks the worker URL.
  optimizeDeps: { exclude: ["@ffmpeg/ffmpeg"] },
  worker: { format: "es" },
});
