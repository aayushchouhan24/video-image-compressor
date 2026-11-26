# Smasher

Compress videos and images to a target size, right in your browser. Nothing is uploaded: every file stays on your device.

## Features

### Video
- **Two modes:** hit a target size (MB), or keep a quality level (CRF).
- **One-click size presets:** 8 MB (Discord), 16 MB (WhatsApp), 25 MB (email), 50 MB.
- **MP4 (H.264)** for playback everywhere, or **WebM (VP8)** for web pages.
- **Settings:** resolution (4K to 360p, never upscales), frame rate, audio bitrate or remove audio, and encode speed.
- **Trim** with start and end times (`75` or `1:15`).
- **While it runs:** live progress with time remaining, and a cancel button.
- **When it's done:** a preview of the result, the original and new size, % saved, and a download button.
- **Low memory:** the video is read from disk as it encodes (WORKERFS) instead of being copied whole into memory.

### Image
- **Batch:** drop many images, click to choose, or paste with **Ctrl+V**.
- **Target size per image** (KB), with presets.
- **WebP** keeps transparency; **JPEG** works everywhere, and transparent areas are filled white.
- **Search:** tries lower quality first, then smaller dimensions, until the image fits the target.
- **Background worker** (OffscreenCanvas), so the page never freezes, even on huge images.
- **Results:** thumbnails, before/after sizes, and a **Download all** button.

## Getting started

Requires Node.js 18 or later.

```bash
npm install
npm run dev       # start the dev server
npm run build     # production build in dist/
npm run preview   # serve the production build
npm test          # unit tests (node:test)
```

## How it works

| Part | Tech |
| --- | --- |
| Build | [Vite](https://vite.dev), plain JavaScript, no framework |
| Video | [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) single-thread core, bundled with the app (no CDN) |
| Image | `createImageBitmap` + `OffscreenCanvas.convertToBlob` in a Web Worker |

### Project layout

```
index.html            UI for both tabs
src/main.js           tab switching and paste handling
src/video.js          video tool (FFmpeg engine, progress, cancel)
src/encode.js         builds the FFmpeg arguments (pure functions, tested)
src/image.js          image tool UI and queue
src/image.worker.js   worker entry
src/image-core.js     quality search and resizing (tested)
src/style.css         styles
```

## Limitations

- **First video run:** downloads the ~32 MB FFmpeg engine; after that the browser caches it.
- **Slow encoding:** video encodes on a single thread, so long or 4K videos take a while.
  A multi-threaded engine would need COOP/COEP headers on the host.
- **WebM is VP8, not VP9:** VP9 crashes the ffmpeg.wasm 0.12 core.
- **MKV:** browsers can encode MKV files but usually can't show a preview of them.
- **Memory:** very large images need several times their file size in memory while decoding.
