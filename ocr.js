import { createWorker } from "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/+esm";

function normalizeText(input) {
  return (input || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s:/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLines(text) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

/**
 * Rotates a canvas image by specified degrees (0, 90, 180, 270)
 */
async function rotateImageFile(file, degrees) {
  if (degrees === 0 || file.type === "application/pdf") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const canvas = document.createElement("canvas");
  if (degrees === 90 || degrees === 270) {
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
  } else {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }

  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);

  if (degrees === 90 || degrees === 270) {
    ctx.drawImage(bitmap, -bitmap.height / 2, -bitmap.width / 2);
  } else {
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  }

  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], `rotated-${degrees}.png`, { type: "image/png" }) : file);
    }, "image/png");
  });
}

/**
 * Blue Pen Ink Channel Extractor & Underline Filter
 */
async function createHandwrittenInkIsolatedImage(file) {
  if (file.type === "application/pdf") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const canvas = document.createElement("canvas");
  const maxWidth = 2000;
  const scale = Math.min(2.5, maxWidth / bitmap.width);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const isBluePen = (b > r + 8 && b > g - 12) || (b - r > 10);
    const isDarkInk = (r < 120 && g < 120 && b < 140);

    if (isBluePen || isDarkInk) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
  }

  const rowBlackCounts = new Int32Array(height);
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] === 0) count++;
    }
    rowBlackCounts[y] = count;
  }

  const lineThreshold = Math.round(width * 0.35);
  for (let y = 1; y < height - 1; y++) {
    if (rowBlackCounts[y] > lineThreshold) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const aboveDark = data[((y - 1) * width + x) * 4] === 0;
        const belowDark = data[((y + 1) * width + x) * 4] === 0;
        if (!(aboveDark && belowDark)) {
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], "handwriting-isolated.png", { type: "image/png" }) : file);
    }, "image/png");
  });
}

/**
 * Creates an Adaptive Threshold binarized image.
 */
async function createAdaptiveThresholdImage(file) {
  if (file.type === "application/pdf") return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const canvas = document.createElement("canvas");
  const maxWidth = 1800;
  const scale = Math.min(2, maxWidth / bitmap.width);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y * width + x] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    }
  }

  const windowSize = Math.max(15, Math.round(width / 35));
  const halfWin = Math.floor(windowSize / 2);
  const k = 0.18;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const minX = Math.max(0, x - halfWin);
      const maxX = Math.min(width - 1, x + halfWin);
      const minY = Math.max(0, y - halfWin);
      const maxY = Math.min(height - 1, y + halfWin);

      let sum = 0;
      let count = 0;
      for (let wy = minY; wy <= maxY; wy += 3) {
        for (let wx = minX; wx <= maxX; wx += 3) {
          sum += gray[wy * width + wx];
          count++;
        }
      }
      const localMean = sum / (count || 1);
      const threshold = localMean * (1 - k);

      for (let dy = 0; dy < 2 && y + dy < height; dy++) {
        for (let dx = 0; dx < 2 && x + dx < width; dx++) {
          const pixelIndex = (y + dy) * width + (x + dx);
          const pxIdx = pixelIndex * 4;
          const val = gray[pixelIndex] < threshold ? 0 : 255;
          data[pxIdx] = val;
          data[pxIdx + 1] = val;
          data[pxIdx + 2] = val;
        }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? new File([blob], "adaptive-threshold.png", { type: "image/png" }) : file);
    }, "image/png");
  });
}

async function runOcrOnSingleImage(worker, imageFile) {
  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "11"
  });
  const res1 = await worker.recognize(imageFile);
  const text1 = res1?.data?.text || "";

  await worker.setParameters({
    preserve_interword_spaces: "1",
    tessedit_pageseg_mode: "6"
  });
  const res2 = await worker.recognize(imageFile);
  const text2 = res2?.data?.text || "";

  const combined = `${text1}\n${text2}`;
  const lines = Array.from(new Set([...normalizeLines(text1), ...normalizeLines(text2)]));
  const conf = Math.round(Math.max(res1?.data?.confidence || 0, res2?.data?.confidence || 0));

  return { text: combined, lines, confidence: conf };
}

/**
 * Multi-Angle Auto-Rotation OCR Engine
 * Tests 0°, 90°, 270°, and 180° orientations automatically if image is uploaded sideways or upside down.
 */
export async function extractOcrText(file, rotationAngle = 0) {
  let worker;
  try {
    worker = await createWorker("eng+hin", 1);
  } catch {
    worker = await createWorker("eng", 1);
  }

  try {
    // 1. Process at requested rotation angle (or 0°)
    let sourceFile = rotationAngle !== 0 ? await rotateImageFile(file, rotationAngle) : file;
    let inkFile = await createHandwrittenInkIsolatedImage(sourceFile);
    let adaptiveFile = await createAdaptiveThresholdImage(sourceFile);

    let primaryResult = await runOcrOnSingleImage(worker, inkFile);
    let secondaryResult = await runOcrOnSingleImage(worker, adaptiveFile);

    let bestText = `${primaryResult.text}\n${secondaryResult.text}`;
    let bestLines = Array.from(new Set([...primaryResult.lines, ...secondaryResult.lines]));
    let bestConfidence = Math.max(primaryResult.confidence, secondaryResult.confidence);
    let bestAngle = rotationAngle;

    // 2. If text confidence or line count is low, test 90°, 270°, 180° rotation automatically!
    if (bestLines.length < 3 || bestConfidence < 40) {
      const testAngles = [90, 270, 180].filter((a) => a !== rotationAngle);
      for (const angle of testAngles) {
        const rotated = await rotateImageFile(file, angle);
        const rotAdaptive = await createAdaptiveThresholdImage(rotated);
        const rotRes = await runOcrOnSingleImage(worker, rotAdaptive);

        if (rotRes.lines.length > bestLines.length || rotRes.confidence > bestConfidence + 15) {
          bestText = rotRes.text;
          bestLines = rotRes.lines;
          bestConfidence = rotRes.confidence;
          bestAngle = angle;
        }
      }
    }

    return {
      text: bestText,
      normalizedText: normalizeText(bestText),
      lines: bestLines,
      confidence: bestConfidence,
      detectedAngle: bestAngle
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export { rotateImageFile };
