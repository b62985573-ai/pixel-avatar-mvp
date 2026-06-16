# Pixel Avatar MVP

Pixel Avatar MVP is a basic MVP for uploading a portrait photo and generating a downloadable pixel-style avatar.

## Version

Algorithm-based MVP. This version does not use AI image generation models. It only performs face detection, avatar cropping, image enhancement, and pixelation on the uploaded photo.

## Features

- Image upload: JPG, PNG, and WebP.
- Original photo preview.
- Browser-side face detection.
- Face-aware avatar crop with center-crop fallback.
- Pixel precision options: 32, 64, and 128.
- 512x512 PNG generation.
- PNG download.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Sharp
- MediaPipe Face Detection via `@mediapipe/tasks-vision`

## Local Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Build

```bash
pnpm build
```

## Deployment

Recommended deployment path:

1. Push this project to GitHub.
2. Import the GitHub repository in Vercel.
3. Use the Next.js framework preset.
4. Use `pnpm build` as the build command.

No output directory is required for a standard Next.js deployment on Vercel.

## API

`POST /api/pixelate`

Accepts `multipart/form-data`:

- `image`: JPG, PNG, or WebP file.
- `pixelSize`: `32`, `64`, or `128`.
- `faceBox`: optional JSON string from browser-side face detection.

Returns a 512x512 PNG image.

## MVP Limitations

- This version is closer to a photo pixelation tool than an AI character redraw tool.
- It does not create a new illustrated character from scratch.
- Results can be unstable for distant portraits, complex backgrounds, side faces, occluded faces, and low-resolution photos.

## Next Steps

- Test an AI image generation route.
- Integrate an AI image generation API.
- Improve pixel character style consistency.
- Add more avatar style controls.
