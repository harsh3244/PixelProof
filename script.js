import { extractOcrText, extractOcrTextFromMultiple, rotateImageFile } from "./ocr.js?v=2.5.1";
import { detectFaceInImage } from "./faceDetection.js?v=2.5.1";
import { analyzeImageQuality, evaluateDocumentScreening } from "./scoring.js?v=2.5.1";
import { getTrainedModel, saveTrainedModel, clearTrainedModel, trainModelFromImages } from "./trainer.js?v=2.5.1";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const STORAGE_KEY_NAME = "pixelproof_holder_name";

const state = {
  files: [],
  rotationAngles: [],
  previewUrls: [],
  analyzing: false,
  training: false,
  selectedDocType: "auto",
  activeMode: "verify",
  trainedModel: null
};

// DOM Elements
const overlay = document.getElementById("verificationOverlay");
const closeModalBtn = document.getElementById("closeModalBtn");
const macCloseDot = document.getElementById("macCloseDot");
const navLaunchBtn = document.getElementById("navLaunchBtn");
const trainStudioNavBtn = document.getElementById("trainStudioNavBtn");
const heroInspectBtn = document.getElementById("heroInspectBtn");
const trainStudioHeroBtn = document.getElementById("trainStudioHeroBtn");
const openFromScriptBtn = document.getElementById("openFromScriptBtn");
const fullNameInput = document.getElementById("fullNameInput");
const dropzone = document.getElementById("dropzone");
const dropzoneTitle = document.getElementById("dropzoneTitle");
const fileInput = document.getElementById("fileInput");
const previewImage = document.getElementById("previewImage");
const multiImageGallery = document.getElementById("multiImageGallery");
const analyzeBtn = document.getElementById("analyzeBtn");
const trainActionBtn = document.getElementById("trainActionBtn");
const trainSamplePresetBtn = document.getElementById("trainSamplePresetBtn");
const resetBtn = document.getElementById("resetBtn");
const statusMessage = document.getElementById("statusMessage");
const verdictText = document.getElementById("verdictText");
const binaryResultCard = document.getElementById("binaryResultCard");
const resultBadgePill = document.getElementById("resultBadgePill");
const checksContainer = document.getElementById("checksContainer");
const docTypeTabs = document.getElementById("docTypeTabs");

const tabModeVerify = document.getElementById("tabModeVerify");
const tabModeTrain = document.getElementById("tabModeTrain");
const panelInputTitle = document.getElementById("panelInputTitle");
const panelResultTitle = document.getElementById("panelResultTitle");
const modalTitleText = document.getElementById("modalTitleText");
const docSelectorContainer = document.getElementById("docSelectorContainer");
const holderNameContainer = document.getElementById("holderNameContainer");

const trainingProgressBar = document.getElementById("trainingProgressBar");
const trainingProgressFill = document.getElementById("trainingProgressFill");
const trainingProgressPercent = document.getElementById("trainingProgressPercent");
const trainingProgressText = document.getElementById("trainingProgressText");

const trainedModelBadgeCard = document.getElementById("trainedModelBadgeCard");


const trainedModelDetails = document.getElementById("trainedModelDetails");
const clearModelBtn = document.getElementById("clearModelBtn");

const imageControls = document.getElementById("imageControls");
const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");

// Initialize Holder Name and Trained Model from Storage
function initStorage() {
  if (fullNameInput) {
    const cachedName = localStorage.getItem(STORAGE_KEY_NAME);
    if (cachedName) {
      fullNameInput.value = cachedName;
    } else {
      fullNameInput.value = "Harshvardhan Hajgude";
      localStorage.setItem(STORAGE_KEY_NAME, "Harshvardhan Hajgude");
    }

    fullNameInput.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val.trim()) {
        localStorage.setItem(STORAGE_KEY_NAME, val.trim());
      }
    });
  }

  state.trainedModel = getTrainedModel();
  updateTrainedModelUI();
}

initStorage();

function updateTrainedModelUI() {
  if (!trainedModelDetails) return;
  const m = state.trainedModel;
  if (m) {
    trainedModelDetails.innerHTML = `
      <div style="color:var(--text-main);font-weight:600;margin-bottom:2px;">
        Model Accuracy: <span style="color:var(--accent-emerald);font-weight:700;">${m.accuracyScore}%</span> (${m.sampleCount} Training Samples)
      </div>
      <div>
        Learned Vocabulary: ${m.learnedVocabulary ? m.learnedVocabulary.slice(0, 5).map(v => v.word).join(", ") : "N/A"}
      </div>
      <div style="font-size:0.72rem;margin-top:2px;">
        Trained on: ${new Date(m.trainedAt).toLocaleString()}
      </div>
    `;
    if (clearModelBtn) clearModelBtn.style.display = "inline-block";
  } else {
    trainedModelDetails.textContent =
      'No custom model trained yet. Upload multiple sample images & click "Train Engine from Images" to train layout & text rules.';
    if (clearModelBtn) clearModelBtn.style.display = "none";
  }
}

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
        <span>Upload document image(s) and click 'Run Verification'.</span>
      </div>`;
  }
}

function revokePreviewUrls() {
  state.previewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.previewUrls = [];
}

function resetState() {
  state.files = [];
  state.rotationAngles = [];
  state.analyzing = false;
  state.training = false;
  revokePreviewUrls();

  if (previewImage) {
    previewImage.src = "";
    previewImage.style.transform = "rotate(0deg)";
    previewImage.classList.add("hidden");
  }
  if (multiImageGallery) {
    multiImageGallery.innerHTML = "";
    multiImageGallery.classList.add("hidden");
  }
  if (imageControls) imageControls.style.display = "none";
  if (dropzonePrompt) dropzonePrompt.style.display = "flex";
  if (fileInput) fileInput.value = "";
  if (trainingProgressBar) trainingProgressBar.classList.add("hidden");

  clearResultUI();
  setStatus("Form and document buffer reset.", "success");
}


const dropzonePrompt = document.getElementById("dropzonePrompt");

function renderGallery() {
  if (!multiImageGallery) return;
  revokePreviewUrls();
  multiImageGallery.innerHTML = "";

  if (state.files.length === 0) {
    multiImageGallery.classList.add("hidden");
    if (previewImage) previewImage.classList.add("hidden");
    if (imageControls) imageControls.style.display = "none";
    if (dropzonePrompt) dropzonePrompt.style.display = "flex";
    return;
  }

  // Hide empty dropzone prompt when files are loaded
  if (dropzonePrompt) dropzonePrompt.style.display = "none";

  if (state.files.length === 1 && state.files[0].type !== "application/pdf") {
    // Single image view
    multiImageGallery.classList.add("hidden");
    const url = URL.createObjectURL(state.files[0]);
    state.previewUrls.push(url);
    if (previewImage) {
      previewImage.src = url;
      const rot = state.rotationAngles[0] || 0;
      const scale = (rot === 90 || rot === 270) ? 0.75 : 1;
      previewImage.style.transform = `rotate(${rot}deg) scale(${scale})`;
      previewImage.classList.remove("hidden");
    }
    if (imageControls) imageControls.style.display = "flex";
    return;
  }

  // Multi-image gallery grid
  if (previewImage) previewImage.classList.add("hidden");
  if (imageControls) imageControls.style.display = "none";
  multiImageGallery.classList.remove("hidden");

  state.files.forEach((file, idx) => {
    const card = document.createElement("div");
    card.className = "thumb-card";

    const rot = state.rotationAngles[idx] || 0;
    const scale = (rot === 90 || rot === 270) ? 0.75 : 1;
    const url = URL.createObjectURL(file);
    state.previewUrls.push(url);

    card.innerHTML = `
      <div class="thumb-header">
        <span class="thumb-badge">#${idx + 1}</span>
        <div class="thumb-actions">
          <button type="button" class="thumb-btn rotate-thumb" data-idx="${idx}" title="Rotate 90°">&#x21BB;</button>
          <button type="button" class="thumb-btn remove-thumb" data-idx="${idx}" title="Remove image">&times;</button>
        </div>
      </div>
      <div class="thumb-img-container">
        <img src="${url}" style="transform:rotate(${rot}deg) scale(${scale});" alt="${file.name || 'Document'}" />
      </div>
    `;

    multiImageGallery.appendChild(card);
  });

  multiImageGallery.querySelectorAll(".rotate-thumb").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      state.rotationAngles[idx] = ((state.rotationAngles[idx] || 0) + 90) % 360;
      renderGallery();
      setStatus(`Image #${idx + 1} rotated (${state.rotationAngles[idx]}°).`, "success");
    });
  });

  multiImageGallery.querySelectorAll(".remove-thumb").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      state.files.splice(idx, 1);
      state.rotationAngles.splice(idx, 1);
      renderGallery();
      setStatus(`Removed image #${idx + 1}. ${state.files.length} image(s) remaining.`, "success");
    });
  });
}


function validateFile(file) {
  if (!file) return "Please select or drop a document image.";
  if (!ACCEPTED_TYPES.has(file.type)) return "Only JPG, PNG, WEBP, and PDF files are supported.";
  if (file.size > MAX_UPLOAD_BYTES) return "File size must be 10MB or smaller.";
  return null;
}

function addFiles(fileList) {
  const newFiles = Array.from(fileList);
  for (const file of newFiles) {
    const err = validateFile(file);
    if (err) {
      setStatus(err, "error");
      return;
    }
    state.files.push(file);
    state.rotationAngles.push(0);
  }

  renderGallery();
  setStatus(
    `${state.files.length} document image(s) loaded. Ready for ${state.activeMode === "train" ? "training" : "verification"}.`,
    "success"
  );
}

function handleRotate(delta) {
  if (state.files.length === 0) return;
  const idx = 0;
  state.rotationAngles[idx] = (state.rotationAngles[idx] + delta + 360) % 360;
  renderGallery();
  setStatus(`Image rotated (${state.rotationAngles[idx]}°).`, "success");
}


function switchMode(mode) {
  state.activeMode = mode;
  const isTrain = mode === "train";

  if (tabModeVerify) tabModeVerify.classList.toggle("active", !isTrain);
  if (tabModeTrain) tabModeTrain.classList.toggle("active", isTrain);

  if (modalTitleText) modalTitleText.textContent = isTrain ? "AI Model Training Studio (Multi-Image)" : "Document Verification Inspector";
  if (panelInputTitle) panelInputTitle.textContent = isTrain ? "Training Image Dataset" : "Inspection Inputs";
  if (panelResultTitle) panelResultTitle.textContent = isTrain ? "Model Training Status" : "Verification Output";

  if (docSelectorContainer) docSelectorContainer.style.display = isTrain ? "none" : "block";
  if (holderNameContainer) holderNameContainer.style.display = isTrain ? "none" : "block";

  if (dropzoneTitle) dropzoneTitle.textContent = isTrain ? "Drop multiple sample training images here" : "Drop document image(s) or PDF here";

  if (analyzeBtn) analyzeBtn.classList.toggle("hidden", isTrain);
  if (trainActionBtn) trainActionBtn.classList.toggle("hidden", !isTrain);
  if (trainSamplePresetBtn) trainSamplePresetBtn.classList.toggle("hidden", !isTrain);

  setStatus(`Switched to ${isTrain ? "AI Model Training Studio" : "Document Inspection"} mode.`);
}

function openVerificationModal(mode = "verify") {
  if (overlay) {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
  }
  switchMode(mode);
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
      const isFail = checkText.includes("mismatch") || checkText.includes("not specified") || checkText.includes("Failed");
      const isPass = !isFail && (
        checkText.startsWith("Document Classification:") ||
        checkText.includes("verified") ||
        checkText.includes("Verified") ||
        checkText.includes("Exact Match") ||
        checkText.includes("Match Confirmed") ||
        checkText.includes("recognized") ||
        checkText.includes("VERIFIED") ||
        checkText.includes("Evaluated against") ||
        checkText.includes("Record")
      );
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

  if (state.files.length === 0) {
    setStatus("Please select or drop at least one document image.", "error");
    return;
  }

  const enteredName = fullNameInput ? fullNameInput.value.trim() : "";
  if (enteredName.length < 2) {
    setStatus("Please enter document holder name before verification.", "error");
    return;
  }

  localStorage.setItem(STORAGE_KEY_NAME, enteredName);

  state.analyzing = true;
  if (analyzeBtn) analyzeBtn.disabled = true;
  setStatus(`Analyzing ${state.files.length} image(s) (Multi-image OCR & Face Fusion active)...`);

  try {
    const processedFiles = [];
    for (const f of state.files) {
      if (f.type === "application/pdf") {
        const conv = await withTimeout(convertPdfFirstPageToImage(f), 12000, "PDF conversion timeout");
        processedFiles.push(conv);
      } else {
        processedFiles.push(f);
      }
    }

    const [ocrResult, faceResults] = await Promise.all([
      withTimeout(extractOcrTextFromMultiple(processedFiles, state.rotationAngles), 35000, "Multi-OCR timeout"),
      Promise.all(processedFiles.map(f => detectFaceInImage(f).catch(() => ({ status: "uncertain" }))))
    ]);

    const anyFaceDetected = faceResults.some(fr => fr && (fr.status === true || fr.status === "detected"));
    const faceStatus = anyFaceDetected ? true : "uncertain";

    const screening = evaluateDocumentScreening({
      text: ocrResult.text,
      lines: ocrResult.lines,
      enteredName,
      documentType: state.selectedDocType,
      faceStatus,
      quality: { photoRegionLikely: anyFaceDetected },
      trainedModel: state.trainedModel,
      imageCount: state.files.length
    });

    renderResult(screening);
    setStatus(`Verification complete on ${state.files.length} document image(s).`, "success");
  } catch (err) {
    setStatus(`Error: ${err.message || "Inspection failed"}`, "error");
  } finally {
    state.analyzing = false;
    if (analyzeBtn) analyzeBtn.disabled = false;
  }
}

/**
 * Runs Custom AI Model Training pipeline using state.files or generated training set
 */
async function startModelTraining(filesToTrain) {
  if (state.training) return;
  if (!filesToTrain || filesToTrain.length === 0) {
    setStatus("Please upload multiple sample images to train the model.", "error");
    return;
  }

  state.training = true;
  if (trainActionBtn) trainActionBtn.disabled = true;
  if (trainSamplePresetBtn) trainSamplePresetBtn.disabled = true;

  if (trainingProgressBar) trainingProgressBar.classList.remove("hidden");
  if (trainingProgressFill) trainingProgressFill.style.width = "0%";
  if (trainingProgressPercent) trainingProgressPercent.textContent = "0%";

  try {
    const modelData = await trainModelFromImages(filesToTrain, (percent, statusText) => {
      if (trainingProgressFill) trainingProgressFill.style.width = `${percent}%`;
      if (trainingProgressPercent) trainingProgressPercent.textContent = `${percent}%`;
      if (trainingProgressText) trainingProgressText.textContent = statusText;
      setStatus(statusText);
    });

    state.trainedModel = modelData;
    updateTrainedModelUI();
    setStatus(`AI Model successfully trained on ${filesToTrain.length} image(s)! Output accuracy boosted to ${modelData.accuracyScore}%.`, "success");
  } catch (err) {
    setStatus(`Training error: ${err.message || "Training failed"}`, "error");
  } finally {
    state.training = false;
    if (trainActionBtn) trainActionBtn.disabled = false;
    if (trainSamplePresetBtn) trainSamplePresetBtn.disabled = false;
  }
}

/**
 * Programmatic Synthetic Training Preset Generator (3 Multi-Document Samples)
 */
async function runSampleDatasetTraining() {
  setStatus("Generating 3 multi-document sample images for instant AI training...");

  const docTypes = ["aadhaar", "dl", "student"];
  const holderName = localStorage.getItem(STORAGE_KEY_NAME) || "Harshvardhan Hajgude";
  const presetFiles = [];

  for (const docType of docTypes) {
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
      ctx.fillStyle = "#b91c1c";
      ctx.font = "bold 32px monospace";
      ctx.fillText("9999 3737 4488", 230, 320);
    } else if (docType === "dl") {
      ctx.fillStyle = "#1e3a8a";
      ctx.fillRect(0, 0, canvas.width, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("UNION OF INDIA DRIVING LICENCE", 40, 45);
      ctx.fillStyle = "#334155";
      ctx.fillRect(50, 130, 150, 190);
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(`Licence No: DL-0420180012345`, 230, 160);
      ctx.fillText(`Name: ${holderName}`, 230, 200);
      ctx.fillText("Valid Till: 2038-08-15", 230, 320);
    } else {
      ctx.fillStyle = "#4338ca";
      ctx.fillRect(0, 0, canvas.width, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px sans-serif";
      ctx.fillText("QUANTUM CODERS - CERTIFICATE", 40, 45);
      ctx.fillStyle = "#334155";
      ctx.fillRect(50, 130, 150, 190);
      ctx.font = "bold 22px sans-serif";
      ctx.fillText(`Member Name: ${holderName}`, 230, 160);
      ctx.fillText("Certificate No: QC-2026-0055", 230, 200);
    }

    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    presetFiles.push(new File([blob], `training-sample-${docType}.png`, { type: "image/png" }));
  }

  state.files = presetFiles;
  state.rotationAngles = presetFiles.map(() => 0);
  renderGallery();

  await startModelTraining(presetFiles);
}

/**
 * Programmatic Synthetic Sample Generator for all 5 Document Types
 */
async function loadSamplePreset(docType) {
  openVerificationModal("verify");
  resetState();

  if (docTypeTabs) {
    docTypeTabs.querySelectorAll(".doc-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.type === docType);
    });
    state.selectedDocType = docType;
  }

  let holderName = localStorage.getItem(STORAGE_KEY_NAME) || "Harshvardhan Hajgude";
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
    ctx.fillText("QUANTUM CODERS", 40, 45);

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("CERTIFICATE OF MEMBERSHIP", 40, 110);

    ctx.fillStyle = "#334155";
    ctx.fillRect(50, 130, 150, 190);

    ctx.font = "bold 22px sans-serif";
    ctx.fillText(`Member Name: ${holderName}`, 230, 160);
    ctx.fillText("Certificate No: QC-2026-0055", 230, 200);
    ctx.fillText("Official Member of Quantum Coders", 230, 240);
  }

  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const sampleFile = new File([blob], `sample-${docType}.png`, { type: "image/png" });

  state.files = [sampleFile];
  state.rotationAngles = [0];
  renderGallery();
}

// Event Listeners
if (navLaunchBtn) navLaunchBtn.addEventListener("click", () => openVerificationModal("verify"));
if (trainStudioNavBtn) trainStudioNavBtn.addEventListener("click", () => openVerificationModal("train"));
if (heroInspectBtn) heroInspectBtn.addEventListener("click", () => openVerificationModal("verify"));
if (trainStudioHeroBtn) trainStudioHeroBtn.addEventListener("click", () => openVerificationModal("train"));
if (openFromScriptBtn) openFromScriptBtn.addEventListener("click", () => openVerificationModal("verify"));
if (closeModalBtn) closeModalBtn.addEventListener("click", closeVerificationModal);
if (macCloseDot) macCloseDot.addEventListener("click", closeVerificationModal);

if (tabModeVerify) tabModeVerify.addEventListener("click", () => switchMode("verify"));
if (tabModeTrain) tabModeTrain.addEventListener("click", () => switchMode("train"));

if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeCurrentImage);
if (trainActionBtn) trainActionBtn.addEventListener("click", () => startModelTraining(state.files));
if (trainSamplePresetBtn) trainSamplePresetBtn.addEventListener("click", runSampleDatasetTraining);
if (resetBtn) resetBtn.addEventListener("click", resetState);

if (clearModelBtn) {
  clearModelBtn.addEventListener("click", () => {
    clearTrainedModel();
    state.trainedModel = null;
    updateTrainedModelUI();
    setStatus("Custom trained model reset.", "success");
  });
}

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
    if (event.dataTransfer?.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      addFiles(fileInput.files);
    }
  });
}

if (overlay) {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeVerificationModal();
  });
}

// Developer / Trainer Mode Unlock Handler (Hidden from general clients by default)
let devModeActive = false;

function toggleDevMode(forceState) {
  devModeActive = forceState !== undefined ? forceState : !devModeActive;
  const devElements = document.querySelectorAll(".dev-only");
  devElements.forEach((el) => {
    if (devModeActive) {
      if (el.tagName === "SPAN" || el.classList.contains("doc-chip")) {
        el.style.display = "inline-block";
      } else if (el.classList.contains("trained-model-badge-card")) {
        el.style.display = "block";
      } else {
        el.style.display = "flex";
      }
    } else {
      el.style.display = "none";
    }
  });
  if (devModeActive) {
    setStatus("⚡ Developer AI Training Studio Mode Unlocked!", "success");
  }
}

// Auto-check URL parameters (?dev=1, ?admin=1, ?train=1)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("dev") || urlParams.has("admin") || urlParams.has("train")) {
  toggleDevMode(true);
}

// Keyboard shortcut (Cmd+Shift+T or Ctrl+Shift+T)
window.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toUpperCase() === "T") {
    e.preventDefault();
    toggleDevMode();
  }
});

// Triple-click brand logo icon to unlock
const brandLogoIcon = document.getElementById("brandLogoIcon");
if (brandLogoIcon) {
  let clickCount = 0;
  let clickTimer = null;
  brandLogoIcon.addEventListener("click", () => {
    clickCount++;
    clearTimeout(clickTimer);
    if (clickCount >= 3) {
      clickCount = 0;
      toggleDevMode();
    } else {
      clickTimer = setTimeout(() => { clickCount = 0; }, 600);
    }
  });
}

// Global Exports
window.PixelProof = {
  verify: analyzeCurrentImage,
  train: startModelTraining,
  toggleDevMode: toggleDevMode,
  openModal: openVerificationModal,
  closeModal: closeVerificationModal,
  loadSamplePreset: loadSamplePreset
};

window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.loadSamplePreset = loadSamplePreset;
window.toggleDevMode = toggleDevMode;




