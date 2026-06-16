import sharp from "sharp";

export const runtime = "nodejs";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedPixelSizes = new Set([32, 64, 128]);

type FaceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const pixelSizeValue = Number(formData.get("pixelSize") ?? 64);
    const faceBoxValue = formData.get("faceBox");

    if (!(image instanceof File)) {
      return new Response("Image file is required.", { status: 400 });
    }

    if (!allowedTypes.has(image.type)) {
      return new Response("Only JPG, PNG, and WebP images are supported.", {
        status: 400,
      });
    }

    if (!allowedPixelSizes.has(pixelSizeValue)) {
      return new Response("Pixel size must be 32, 64, or 128.", {
        status: 400,
      });
    }

    const inputBuffer = Buffer.from(await image.arrayBuffer());
    const orientedBuffer = await sharp(inputBuffer).rotate().png().toBuffer();
    const metadata = await sharp(orientedBuffer).metadata();
    const { width, height } = metadata;

    if (!width || !height) {
      throw new Error("Invalid image metadata");
    }

    const faceBox =
      typeof faceBoxValue === "string" ? parseFaceBox(faceBoxValue) : null;
    const preferredCrop = faceBox
      ? getFaceCrop(faceBox, width, height)
      : getFallbackCrop(width, height);

    const outputBuffer = await createPixelAvatar({
      imageBuffer: orientedBuffer,
      crop: preferredCrop,
      pixelSize: pixelSizeValue,
      fallbackCrop: getFallbackCrop(width, height),
    });

    return new Response(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'inline; filename="pixel-avatar.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Failed to process image.", { status: 500 });
  }
}

async function createPixelAvatar({
  imageBuffer,
  crop,
  pixelSize,
  fallbackCrop,
}: {
  imageBuffer: Buffer;
  crop: { left: number; top: number; size: number };
  pixelSize: number;
  fallbackCrop: { left: number; top: number; size: number };
}) {
  try {
    return await processPixelAvatar(imageBuffer, crop, pixelSize);
  } catch (error) {
    if (
      crop.left === fallbackCrop.left &&
      crop.top === fallbackCrop.top &&
      crop.size === fallbackCrop.size
    ) {
      throw error;
    }

    console.error("Face crop failed. Retrying with fallback crop.", error);
    return processPixelAvatar(imageBuffer, fallbackCrop, pixelSize);
  }
}

async function processPixelAvatar(
  imageBuffer: Buffer,
  crop: { left: number; top: number; size: number },
  pixelSize: number,
) {
  const enhancedAvatar = await sharp(imageBuffer)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.size,
        height: crop.size,
      })
      .resize(512, 512, {
        fit: "fill",
        kernel: "lanczos3",
      })
      .normalize()
      .modulate({
        saturation: 1.08,
        brightness: 1.02,
      })
      .sharpen()
      .png()
      .toBuffer();

  const pixelGrid = await sharp(enhancedAvatar)
      .resize(pixelSize, pixelSize, {
        fit: "fill",
        kernel: "nearest",
      })
      .png()
      .toBuffer();

  return sharp(pixelGrid)
      .resize(512, 512, {
        fit: "fill",
        kernel: "nearest",
      })
      .png()
      .toBuffer();
}

function parseFaceBox(value: string): FaceBox | null {
  try {
    const parsed = JSON.parse(value) as Partial<FaceBox>;

    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      parsed.width <= 0 ||
      parsed.height <= 0
    ) {
      return null;
    }

    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
    };
  } catch {
    return null;
  }
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
  const fallback = getFallbackCrop(imageWidth, imageHeight);
  const safeFaceBox = normalizeFaceBox(faceBox, imageWidth, imageHeight);

  if (!safeFaceBox) {
    return fallback;
  }

  const faceCenterX = safeFaceBox.x + safeFaceBox.width / 2;
  const faceCenterY = safeFaceBox.y + safeFaceBox.height / 2;

  if (!Number.isFinite(faceCenterX) || !Number.isFinite(faceCenterY)) {
    return fallback;
  }

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
