/**
 * PixelProof Face & Portrait Detection Engine
 * Uses native browser FaceDetector API when available,
 * with automated Canvas YCbCr skin-tone and contour feature detection fallback.
 */

async function detectPortraitWithCanvas(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      status: "uncertain",
      confidence: 50,
      provider: "pixelproof-canvas-fallback",
      reason: "Could not decode image bitmap for face analysis."
    };
  }

  const canvas = document.createElement("canvas");
  const width = 400;
  const scale = width / bitmap.width;
  const height = Math.round(bitmap.height * scale);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  const imageData = ctx.getImageData(0, 0, width, height).data;

  // Search candidate portrait regions (left side of Aadhaar front, or center of cropped photos)
  const regions = [
    { name: "left-portrait", minX: Math.floor(width * 0.05), maxX: Math.floor(width * 0.45), minY: Math.floor(height * 0.15), maxY: Math.floor(height * 0.85) },
    { name: "center-portrait", minX: Math.floor(width * 0.25), maxX: Math.floor(width * 0.75), minY: Math.floor(height * 0.10), maxY: Math.floor(height * 0.90) }
  ];

  let bestSkinCount = 0;
  let bestRegionEdges = 0;
  let bestTotalPixels = 0;

  for (const reg of regions) {
    let skinPixels = 0;
    let edgePixels = 0;
    let total = 0;

    for (let y = reg.minY; y < reg.maxY; y += 2) {
      for (let x = reg.minX; x < reg.maxX; x += 2) {
        const idx = (y * width + x) * 4;
        const r = imageData[idx];
        const g = imageData[idx + 1];
        const b = imageData[idx + 2];

        // Convert RGB to YCbCr space for skin-tone clustering
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
          skinPixels++;
        }

        if (x + 2 < reg.maxX && y + 2 < reg.maxY) {
          const nextIdx = (y * width + (x + 2)) * 4;
          const deltaR = Math.abs(r - imageData[nextIdx]);
          if (deltaR > 25) edgePixels++;
        }
        total++;
      }
    }

    if (skinPixels > bestSkinCount) {
      bestSkinCount = skinPixels;
      bestRegionEdges = edgePixels;
      bestTotalPixels = total;
    }
  }

  const skinRatio = bestTotalPixels ? bestSkinCount / bestTotalPixels : 0;
  const edgeRatio = bestTotalPixels ? bestRegionEdges / bestTotalPixels : 0;

  if (skinRatio >= 0.04 && edgeRatio >= 0.03) {
    return {
      status: true,
      confidence: 88,
      provider: "pixelproof-canvas-portrait-engine",
      reason: "Portrait photo area and facial skin-tone features verified."
    };
  }

  if (skinRatio >= 0.015 || edgeRatio >= 0.05) {
    return {
      status: "uncertain",
      confidence: 65,
      provider: "pixelproof-canvas-portrait-engine",
      reason: "Faint portrait features detected."
    };
  }

  return {
    status: false,
    confidence: 10,
    provider: "pixelproof-canvas-portrait-engine",
    reason: "No portrait face or facial skin-tone features detected."
  };
}

export async function detectFaceInImage(file) {
  // 1. Try Native Browser FaceDetector API if available
  if (typeof window !== "undefined" && typeof window.FaceDetector === "function") {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
      const faces = await detector.detect(bitmap);

      if (faces.length > 0) {
        return {
          status: true,
          confidence: 96,
          provider: "native-face-detector-api",
          reason: "Face detected via native browser FaceDetector API."
        };
      }
    } catch {
      // Fall through to Canvas analysis
    } finally {
      if (bitmap && typeof bitmap.close === "function") {
        bitmap.close();
      }
    }
  }

  // 2. Automated Canvas Portrait Fallback Engine
  return detectPortraitWithCanvas(file);
}
