"use client";

import {
  ChangeEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const pixelSizes = [32, 64, 128] as const;
type PixelSize = (typeof pixelSizes)[number];

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const fallbackError = "Failed to generate avatar. Please try another image.";
const faceModelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite";

type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FaceStatus = "idle" | "detecting" | "detected" | "not-detected";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [pixelSize, setPixelSize] = useState<PixelSize>(64);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const fileLabel = useMemo(() => {
    if (!file) {
      return "JPG, PNG, or WebP";
    }

    const sizeInMb = file.size / (1024 * 1024);
    return `${file.name} - ${sizeInMb.toFixed(2)} MB`;
  }, [file]);

  useEffect(() => {
    const cleanupMediapipeLogFilter = installMediapipeInfoFilter();

    return cleanupMediapipeLogFilter;
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [resultUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setError(null);

    if (!selectedFile) {
      setFile(null);
      setPreviewUrl(null);
      setResultUrl(null);
      setFaceBox(null);
      setFaceStatus("idle");
      return;
    }

    if (!acceptedTypes.includes(selectedFile.type)) {
      setFile(null);
      setPreviewUrl(null);
      setResultUrl(null);
      setFaceBox(null);
      setFaceStatus("idle");
      setError("Please upload a JPG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);

    setFile(selectedFile);
    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreviewUrl);
    setResultUrl(null);
    detectFace(nextPreviewUrl);
  }

  async function handleGenerate() {
    if (!file) return;

    setIsGenerating(true);
    setError(null);

    const formData = new FormData();
    formData.append("image", file);
    formData.append("pixelSize", String(pixelSize));
    if (faceBox) {
      formData.append("faceBox", JSON.stringify(faceBox));
    }

    try {
      const response = await fetch("/api/pixelate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Server pixelation failed.");
      }

      const blob = await response.blob();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(blob));
    } catch {
      try {
        const blob = await generatePixelAvatarInBrowser(file, pixelSize, faceBox);
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(URL.createObjectURL(blob));
      } catch (fallbackGenerateError) {
        setError(
          fallbackGenerateError instanceof Error
            ? fallbackError
            : fallbackError,
        );
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function detectFace(imageUrl: string) {
    setFaceStatus("detecting");
    setFaceBox(null);

    try {
      const image = await loadImage(imageUrl);
      const detector = await getFaceDetector();
      const result = detector.detect(image);
      const detection = result.detections.reduce((largest, current) => {
        const largestArea =
          (largest.boundingBox?.width ?? 0) * (largest.boundingBox?.height ?? 0);
        const currentArea =
          (current.boundingBox?.width ?? 0) * (current.boundingBox?.height ?? 0);

        return currentArea > largestArea ? current : largest;
      }, result.detections[0]);
      const boundingBox = detection?.boundingBox;

      if (!boundingBox) {
        setFaceStatus("not-detected");
        return;
      }

      setFaceBox({
        x: Math.max(0, Math.round(boundingBox.originX)),
        y: Math.max(0, Math.round(boundingBox.originY)),
        width: Math.max(1, Math.round(boundingBox.width)),
        height: Math.max(1, Math.round(boundingBox.height)),
      });
      setFaceStatus("detected");
    } catch (faceError) {
      console.error(faceError);
      setFaceStatus("not-detected");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f4ee] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-2 border-b border-stone-300/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Pixel Avatar MVP
            </p>
            <h1 className="mt-1 max-w-2xl text-3xl font-black leading-tight sm:text-4xl">
              Turn a portrait into a crisp pixel avatar.
            </h1>
          </div>
          <p className="max-w-sm text-sm leading-5 text-stone-600">
            Upload a photo, choose a pixel grid, and export a 512x512 PNG.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-3">
          <section className="flex flex-col gap-4 rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-lg font-bold">Upload photo</h2>
              <p className="mt-1 text-sm text-stone-600">{fileLabel}</p>
            </div>

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square max-h-[320px] w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-stone-300 bg-stone-50 px-5 text-center transition hover:border-teal-600 hover:bg-teal-50 focus:outline-none focus:ring-4 focus:ring-teal-200"
            >
              <span className="text-lg font-bold text-stone-950">
                Choose an image
              </span>
              <span className="mt-2 text-sm text-stone-600">
                JPG / PNG / WebP
              </span>
            </button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />

            <div>
              <label className="text-sm font-bold" htmlFor="pixel-size">
                Pixel precision
              </label>
              <div
                id="pixel-size"
                className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-stone-100 p-1"
              >
                {pixelSizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPixelSize(size)}
                    className={`h-11 rounded-md text-sm font-bold transition ${
                      pixelSize === size
                        ? "bg-teal-700 text-white shadow-sm"
                        : "text-stone-700 hover:bg-white"
                    }`}
                    aria-pressed={pixelSize === size}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={!file || isGenerating}
              className="h-12 rounded-lg bg-stone-950 px-5 text-sm font-bold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200 disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              {isGenerating ? "Generating..." : "Generate Pixel Avatar"}
            </button>

            {!file && (
              <p className="text-sm font-medium text-stone-500">
                Upload an image to start.
              </p>
            )}
            {file && <FaceStatusMessage status={faceStatus} />}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}
          </section>

          <PreviewPanel title="Original photo" imageUrl={previewUrl} />
          <PreviewPanel title="Pixel avatar" imageUrl={resultUrl} isPixelated>
            {resultUrl && (
              <a
                href={resultUrl}
                download="pixel-avatar.png"
                className="mt-4 flex h-11 items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-bold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-4 focus:ring-teal-200"
              >
                Download PNG
              </a>
            )}
          </PreviewPanel>
        </section>

        <footer className="border-t border-stone-300/80 pt-4 text-center text-xs leading-5 text-stone-500">
          This is a basic algorithm-based MVP. It pixelates portraits without
          using AI image generation.
        </footer>
      </div>
    </main>
  );
}

function FaceStatusMessage({ status }: { status: FaceStatus }) {
  if (status === "detecting") {
    return <p className="text-sm font-medium text-stone-500">Detecting face...</p>;
  }

  if (status === "detected") {
    return <p className="text-sm font-bold text-teal-700">Face detected</p>;
  }

  if (status === "not-detected") {
    return (
      <p className="text-sm font-medium text-stone-500">
        No face detected. Using center crop.
      </p>
    );
  }

  return null;
}

function PreviewPanel({
  title,
  imageUrl,
  isPixelated = false,
  children,
}: {
  title: string;
  imageUrl: string | null;
  isPixelated?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-stone-300 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4 flex aspect-square w-full max-w-[420px] items-center justify-center self-center rounded-lg bg-[#f0ede7] bg-[linear-gradient(45deg,rgba(120,113,108,0.06)_25%,transparent_25%),linear-gradient(-45deg,rgba(120,113,108,0.06)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(120,113,108,0.06)_75%),linear-gradient(-45deg,transparent_75%,rgba(120,113,108,0.06)_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] p-3">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            className={`h-full w-full rounded-md object-contain shadow-sm ${
              isPixelated ? "[image-rendering:pixelated]" : ""
            }`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-stone-300 bg-white/50 text-center text-sm font-medium text-stone-500">
            No image yet
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image."));
    image.src = src;
  });
}

function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  return loadImage(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
}

async function generatePixelAvatarInBrowser(
  file: File,
  pixelSize: PixelSize,
  faceBox: FaceBox | null,
) {
  const image = await loadImageFromFile(file);
  const crop = faceBox
    ? getFaceCrop(faceBox, image.naturalWidth, image.naturalHeight)
    : getFallbackCrop(image.naturalWidth, image.naturalHeight);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = 512;
  sourceCanvas.height = 512;

  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("Canvas is not available.");
  }

  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(
    image,
    crop.left,
    crop.top,
    crop.size,
    crop.size,
    0,
    0,
    512,
    512,
  );

  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = pixelSize;
  smallCanvas.height = pixelSize;
  const smallContext = smallCanvas.getContext("2d");
  if (!smallContext) {
    throw new Error("Canvas is not available.");
  }
  smallContext.imageSmoothingEnabled = true;
  smallContext.drawImage(sourceCanvas, 0, 0, pixelSize, pixelSize);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = 512;
  outputCanvas.height = 512;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("Canvas is not available.");
  }
  outputContext.imageSmoothingEnabled = false;
  outputContext.drawImage(smallCanvas, 0, 0, 512, 512);

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not generate PNG."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function getFallbackCrop(width: number, height: number) {
  let size = Math.min(width, height);
  let left = 0;
  let top = 0;

  if (width > height) {
    size = height;
    left = Math.floor((width - height) / 2);
  } else if (height > width) {
    size = width;
    top = Math.max(0, Math.floor((height - width) * 0.25));
  }

  return { left, top, size };
}

function getFaceCrop(faceBox: FaceBox, imageWidth: number, imageHeight: number) {
  const safeFaceBox = normalizeFaceBox(faceBox, imageWidth, imageHeight);

  if (!safeFaceBox) {
    return getFallbackCrop(imageWidth, imageHeight);
  }

  const faceCenterX = safeFaceBox.x + safeFaceBox.width / 2;
  const faceCenterY = safeFaceBox.y + safeFaceBox.height / 2;
  const shortSide = Math.min(imageWidth, imageHeight);
  const isFarPortrait =
    safeFaceBox.width < imageWidth * 0.12 ||
    safeFaceBox.height < imageHeight * 0.12;
  const desiredSize = isFarPortrait
    ? Math.max(safeFaceBox.width * 4.2, safeFaceBox.height * 5.0)
    : Math.max(safeFaceBox.width * 3.2, safeFaceBox.height * 3.8);
  const minSize = shortSide * 0.35;
  const maxSize = shortSide * (isFarPortrait ? 0.8 : 0.9);
  const size = Math.round(clamp(desiredSize, minSize, maxSize));
  const cropCenterX = faceCenterX;
  const cropCenterY =
    faceCenterY + safeFaceBox.height * (isFarPortrait ? 0.65 : 0.45);
  const left = clamp(
    Math.round(cropCenterX - size / 2),
    0,
    imageWidth - size,
  );
  const top = clamp(
    Math.round(cropCenterY - size / 2),
    0,
    imageHeight - size,
  );

  return { left, top, size };
}

function normalizeFaceBox(
  faceBox: FaceBox,
  imageWidth: number,
  imageHeight: number,
) {
  const x = clamp(Math.round(faceBox.x), 0, imageWidth - 1);
  const y = clamp(Math.round(faceBox.y), 0, imageHeight - 1);
  const right = clamp(
    Math.round(faceBox.x + faceBox.width),
    x + 1,
    imageWidth,
  );
  const bottom = clamp(
    Math.round(faceBox.y + faceBox.height),
    y + 1,
    imageHeight,
  );
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

let faceDetectorPromise: Promise<
  import("@mediapipe/tasks-vision").FaceDetector
> | null = null;

async function getFaceDetector() {
  if (!faceDetectorPromise) {
    faceDetectorPromise = import("@mediapipe/tasks-vision").then(
      async ({ FaceDetector, FilesetResolver }) => {
        return withoutMediapipeInfoOverlay(async () => {
          const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
          );

          return FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: faceModelUrl,
            },
            runningMode: "IMAGE",
            minDetectionConfidence: 0.45,
          });
        });
      },
    );
  }

  return faceDetectorPromise;
}

async function withoutMediapipeInfoOverlay<T>(task: () => Promise<T>) {
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    if (isMediapipeInfoMessage(args)) {
      return;
    }

    originalConsoleError(...args);
  };

  try {
    return await task();
  } finally {
    console.error = originalConsoleError;
  }
}

function installMediapipeInfoFilter() {
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    if (isMediapipeInfoMessage(args)) {
      return;
    }

    originalConsoleError(...args);
  };

  return () => {
    console.error = originalConsoleError;
  };
}

function isMediapipeInfoMessage(args: unknown[]) {
  return args
    .map(String)
    .join(" ")
    .includes("Created TensorFlow Lite XNNPACK delegate for CPU");
}
