import { extractOcrText, rotateImageFile } from "./ocr.js?v=2.1.0";
import { detectFaceInImage } from "./faceDetection.js?v=2.1.0";
import { analyzeImageQuality, evaluateDocumentScreening } from "./scoring.js?v=2.1.0";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const state = {
  file: null,
  previewUrl: null,
  analyzing: false,
  selectedDocType: "auto",
  rotationAngle: 0
};

// DOM Elements
const overlay = document.getElementById("verificationOverlay");
const closeModalBtn = document.getElementById("closeModalBtn");
const macCloseDot = document.getElementById("macCloseDot");
const navLaunchBtn = document.getElementById("navLaunchBtn");
const heroInspectBtn = document.getElementById("heroInspectBtn");
const openFromScriptBtn = document.getElementById("openFromScriptBtn");
const fullNameInput = document.getElementById("fullNameInput");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const previewImage = document.getElementById("previewImage");
const analyzeBtn = document.getElementById("analyzeBtn");
const resetBtn = document.getElementById("resetBtn");
const statusMessage = document.getElementById("statusMessage");
const verdictText = document.getElementById("verdictText");
const binaryResultCard = document.getElementById("binaryResultCard");
const resultBadgePill = document.getElementById("resultBadgePill");
const checksContainer = document.getElementById("checksContainer");
const docTypeTabs = document.getElementById("docTypeTabs");

const imageControls = document.getElementById("imageControls");
const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");

function setStatus(message, tone) {
  if (!statusMessage) return;
  statusMessage.textContent = message || "";
  statusMessage.className = "status-msg";
  if (tone) statusMessage.classList.add(tone);
}

function clearResultUI() {
  if (verdictText) verdictText.textContent = "Awaiting Inspection";
  if (binaryResultCard) binaryResultCard.className = "binary-result-card";
  if (resultBadgePill) {
    resultBadgePill.textContent = "PENDING";
    resultBadgePill.className = "result-badge-pill pending";
  }
  if (checksContainer) {
    checksContainer.innerHTML = `
      <div class="check-row">
        <span class="check-icon">&bull;</span>
        <span>Upload document image and click 'Run Verification'.</span>
      </div>`;
  }
}

function revokePreviewUrl() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function resetState() {
  state.file = null;
  state.analyzing = false;
  state.rotationAngle = 0;
  revokePreviewUrl();
  if (previewImage) {
    previewImage.src = "";
    previewImage.style.transform = "rotate(0deg)";
    previewImage.classList.add("hidden");
  }
  if (imageControls) imageControls.style.display = "none";
  if (fileInput) fileInput.value = "";
  clearResultUI();
  setStatus("");
}

function updatePreview(file) {
  if (!previewImage) return;
  if (file.type === "application/pdf") {
    previewImage.src = "";
    previewImage.classList.add("hidden");
    if (imageControls) imageControls.style.display = "none";
    return;
  }
  revokePreviewUrl();
  state.previewUrl = URL.createObjectURL(file);
  previewImage.src = state.previewUrl;
  previewImage.style.transform = `rotate(${state.rotationAngle}deg)`;
  previewImage.classList.remove("hidden");
  if (imageControls) imageControls.style.display = "flex";
}

function validateFile(file) {
  if (!file) return "Please select or drop a document image.";
  if (!ACCEPTED_TYPES.has(file.type)) return "Only JPG, PNG, WEBP, and PDF files are supported.";
  if (file.size > MAX_UPLOAD_BYTES) return "File size must be 10MB or smaller.";
  return null;
}

function setFile(file) {
  const err = validateFile(file);
  if (err) {
    setStatus(err, "error");
    return;
  }
  state.file = file;
  state.rotationAngle = 0;
  updatePreview(file);
  setStatus("Document loaded. Use Rotate buttons if image is sideways.", "success");
}

async function handleRotate(delta) {
  if (!state.file) return;
  state.rotationAngle = (state.rotationAngle + delta + 360) % 360;
  if (previewImage) {
    previewImage.style.transform = `rotate(${state.rotationAngle}deg)`;
  }
  state.file = await rotateImageFile(state.file, delta > 0 ? 90 : 270);
  setStatus(`Image rotated (${state.rotationAngle}°).`, "success");
}

function openVerificationModal() {
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
}

function closeVerificationModal() {
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
  resetState();
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timerId));
}

async function convertPdfFirstPageToImage(pdfFile) {
  const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/+esm");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";

  const pdfArrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);

  await page.render({ canvasContext: context, viewport }).promise;

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PDF conversion failed"))), "image/png");
  });

  return new File([blob], "pdf-first-page.png", { type: "image/png" });
}

function renderResult(result) {
  const isVerified = result.finalDecision === "VERIFIED";

  if (verdictText) verdictText.textContent = isVerified ? "Document Verified" : "Verification Failed";
  if (binaryResultCard) binaryResultCard.className = `binary-result-card ${isVerified ? "verified" : "unverified"}`;

  if (resultBadgePill) {
    resultBadgePill.textContent = result.finalDecision;
    resultBadgePill.className = `result-badge-pill ${isVerified ? "verified" : "unverified"}`;
  }

  if (checksContainer) {
    checksContainer.innerHTML = "";
    result.diagnosticChecks.forEach((checkText) => {
      const isPass = checkText.includes("verified") || checkText.includes("Exact Match") || checkText.includes("Match Confirmed") || checkText.includes("recognized");
      const row = document.createElement("div");
      row.className = "check-row";
      row.innerHTML = `
        <span class="check-icon ${isPass ? "pass" : "fail"}">${isPass ? "&#10003;" : "&#10007;"}</span>
        <span>${checkText}</span>
      `;
      checksContainer.appendChild(row);
    });
  }
}

async function analyzeCurrentImage() {
  if (state.analyzing) return;

  const fileError = validateFile(state.file);
  if (fileError) {
    setStatus(fileError, "error");
    return;
  }

  const enteredName = fullNameInput ? fullNameInput.value.trim() : "";
  if (enteredName.length < 2) {
    setStatus("Please enter document holder name before verification.", "error");
    return;
  }

  state.analyzing = true;
  if (analyzeBtn) analyzeBtn.disabled = true;
  setStatus("Analyzing document (Auto-detecting photo angle)...");

  try {
    const analysisFile =
      state.file.type === "application/pdf"
        ? await withTimeout(convertPdfFirstPageToImage(state.file), 12000, "PDF conversion timeout")
        : state.file;

    if (state.file.type === "application/pdf") {
      updatePreview(analysisFile);
    }

    const [ocrResult, faceResult, qualityResult] = await Promise.allSettled([
      withTimeout(extractOcrText(analysisFile, state.rotationAngle), 30000, "OCR timeout"),
      withTimeout(detectFaceInImage(analysisFile), 8000, "Face detection timeout"),
      withTimeout(analyzeImageQuality(analysisFile), 8000, "Quality timeout")
    ]);

    const ocr = ocrResult.status === "fulfilled" ? ocrResult.value : { text: "", lines: [] };
    const face = faceResult.status === "fulfilled" ? faceResult.value : { status: "uncertain" };
    const quality = qualityResult.status === "fulfilled" ? qualityResult.value : { photoRegionLikely: true };

    const screening = evaluateDocumentScreening({
      text: ocr.text,
      lines: ocr.lines,
      enteredName,
      documentType: state.selectedDocType,
      faceStatus: face.status,
      quality
    });

    renderResult(screening);
    setStatus("Inspection complete.", "success");
  } catch (err) {
    setStatus(`Error: ${err.message || "Inspection failed"}`, "error");
  } finally {
    state.analyzing = false;
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

/**
 * Programmatic Synthetic Sample Generator for all 5 Document Types
 */
async function loadSamplePreset(docType) {
  openVerificationModal();
  resetState();

  if (docTypeTabs) {
    docTypeTabs.querySelectorAll(".doc-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.type === docType);
    });
    state.selectedDocType = docType;
  }

  let holderName = "Prajyot Vijay Mestry";
  if (fullNameInput) fullNameInput.value = holderName;

  const canvas = document.createElement("canvas");
  canvas.width = 850;
  canvas.height = 540;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (docType === "aadhaar") {
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(0, 0, canvas.width, 65);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("GOVERNMENT OF INDIA / भारत सरकार", 40, 42);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Unique Identification Authority of India (UIDAI)", 40, 105);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 130, 150, 190);

    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`Name: ${holderName}`, 230, 160);
    ctx.fillText("DOB: 15/08/1995", 230, 200);
    ctx.fillText("Gender: MALE / पुरुष", 230, 240);

    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 32px monospace";
    ctx.fillText("9999 3737 4488", 230, 320);
  } else if (docType === "dl") {
    ctx.fillStyle = "#1e3a8a";
    ctx.fillRect(0, 0, canvas.width, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("UNION OF INDIA DRIVING LICENCE", 40, 45);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Transport Department / Motor Vehicles", 40, 110);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 130, 150, 190);

    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`Licence No: DL-0420180012345`, 230, 160);
    ctx.fillText(`Name: ${holderName}`, 230, 200);
    ctx.fillText("DOB: 15/08/1995", 230, 240);
    ctx.fillText("Authorised to Drive: LMV, MCWG", 230, 280);
    ctx.fillText("Valid Till: 2038-08-15", 230, 320);
  } else if (docType === "voter") {
    ctx.fillStyle = "#047857";
    ctx.fillRect(0, 0, canvas.width, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("ELECTION COMMISSION OF INDIA", 40, 45);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Electors Photo Identity Card (EPIC)", 40, 110);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 130, 150, 190);

    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`EPIC No: WBE1234567`, 230, 160);
    ctx.fillText(`Elector Name: ${holderName}`, 230, 200);
    ctx.fillText("Father's Name: Vijay Mestry", 230, 240);
    ctx.fillText("Gender: MALE", 230, 280);
  } else if (docType === "passport") {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, 75);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("PASSPORT - REPUBLIC OF INDIA", 40, 48);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 110, 150, 190);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("Type: P   Code: IND   Passport No: Z1234567", 230, 140);
    ctx.fillText(`Surname: MESTRY`, 230, 180);
    ctx.fillText(`Given Names: PRAJYOT VIJAY`, 230, 220);
    ctx.fillText("Nationality: INDIAN", 230, 260);

    ctx.font = "bold 20px monospace";
    ctx.fillText("P<INDMESTRY<<PRAJYOT<VIJAY<<<<<<<<<<<<<<<<<<<", 40, 400);
    ctx.fillText("Z1234567<8IND9508154M3008151<<<<<<<<<<<<<<<04", 40, 440);
  } else if (docType === "student") {
    ctx.fillStyle = "#4338ca";
    ctx.fillRect(0, 0, canvas.width, 70);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("GOVERNMENT POLYTECHNIC", 40, 45);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Student Identity Card / Academic Year 2025-2026", 40, 110);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 130, 150, 190);

    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`Student Name: ${holderName}`, 230, 160);
    ctx.fillText("Roll No: 2025CS1001", 230, 200);
    ctx.fillText("Programme: AIML / CS", 230, 240);
    ctx.fillText("Valid Upto: JUNE 2028", 230, 280);
  }

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const sampleFile = new File([blob], `sample-${docType}.png`, { type: "image/png" });

  setFile(sampleFile);
}

// Bind Element Listeners
if (navLaunchBtn) navLaunchBtn.addEventListener("click", openVerificationModal);
if (heroInspectBtn) heroInspectBtn.addEventListener("click", openVerificationModal);
if (openFromScriptBtn) openFromScriptBtn.addEventListener("click", openVerificationModal);
if (closeModalBtn) closeModalBtn.addEventListener("click", closeVerificationModal);
if (macCloseDot) macCloseDot.addEventListener("click", closeVerificationModal);
if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeCurrentImage);
if (resetBtn) resetBtn.addEventListener("click", resetState);

if (rotateLeftBtn) rotateLeftBtn.addEventListener("click", () => handleRotate(-90));
if (rotateRightBtn) rotateRightBtn.addEventListener("click", () => handleRotate(90));

document.querySelectorAll(".sample-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const preset = btn.dataset.preset || "aadhaar";
    loadSamplePreset(preset);
  });
});

if (docTypeTabs) {
  docTypeTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".doc-tab");
    if (!btn) return;
    docTypeTabs.querySelectorAll(".doc-tab").forEach((t) => t.classList.remove("active"));
    btn.classList.add("active");
    state.selectedDocType = btn.dataset.type || "auto";
  });
}

if (dropzone && fileInput) {
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
  });

  dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-active");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("drag-active");
  });

  dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-active");
    const file = event.dataTransfer?.files?.[0] || null;
    if (file) setFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0] || null;
    if (file) setFile(file);
  });
}

if (overlay) {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeVerificationModal();
  });
}

// Global Exports
window.PixelProof = {
  verify: analyzeCurrentImage,
  openModal: openVerificationModal,
  closeModal: closeVerificationModal,
  loadSamplePreset: loadSamplePreset
};

window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.loadSamplePreset = loadSamplePreset;
