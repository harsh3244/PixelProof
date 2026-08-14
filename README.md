# PixelProof | High-Precision Document Verification Engine

**PixelProof** is a client-side document verification and screening engine built with HTML5, CSS3, and JavaScript. It analyzes uploaded identity documents (such as Aadhaar cards, identity badges, and certificates) directly inside the user's browser using Tesseract.js OCR, mathematical **Verhoeff Checksum validation**, canvas portrait feature detection, and multi-token fuzzy matching.

---

## Key Features

- **100% Client-Side Privacy**: All OCR, face detection, Verhoeff checksum validation, and quality analysis run locally in browser memory. No private documents are uploaded to third-party servers.
- **Verhoeff Checksum Engine**: Mathematically validates extracted 12-digit Aadhaar number sequences using the $D_5$ dihedral group algorithm and performs smart digit repair for common OCR mistranslations (`O` $\rightarrow$ `0`, `I`/`l` $\rightarrow$ `1`, `S` $\rightarrow$ `5`, `B` $\rightarrow$ `8`).
- **Multi-Token Fuzzy Name Matching**: Handles name order swaps ("Rahul Kumar" vs "Kumar Rahul"), middle names, initials ("K. S. Sharma"), and minor OCR typos.
- **Canvas Image Preprocessing Pipeline**: Automatically applies contrast stretch, grayscale normalization, and edge sharpening before passing image blobs to Tesseract OCR.
- **Multi-Strategy Portrait/Face Fallback**: Combines browser native `FaceDetector` API with an automated Canvas YCbCr skin-tone cluster & contour feature detector to ensure face presence verification works across all browsers (including Safari, Firefox, and standard Chrome).
- **PixelProof Studio UI**: Modern dark-mode aesthetic with glowing accents, animated upload dropzone scanning line, step-by-step progress timeline, and comprehensive diagnostic report breakdown.
- **PDF & Multi-Format Support**: Native support for JPG, PNG, WEBP, and PDF documents (renders page 1 to Canvas automatically).
- **Interactive Sample Presets**: Includes instant synthetic document generators for valid documents, name mismatch tests, blurry scans, and non-Aadhaar files.

---

## System Architecture

```text
PixelProof Engine Architecture
├── index.html            # PixelProof Studio UI & Inspector Modal
├── styles.css            # Dark Glassmorphism CSS Design System & Animations
├── script.js            # PixelProof Controller, PDF renderer, & Preset Generator
├── scoring.js           # Verhoeff Engine, Multi-Token Name Matching, & Score Heuristics
├── ocr.js               # Preprocessed Canvas OCR Engine (Tesseract.js wrapper)
└── faceDetection.js     # Native FaceDetector + Canvas YCbCr Portrait Fallback Engine
```

---

## Verification Logic & Scoring

PixelProof evaluates multiple signals to produce a confidence rating (0–100%):

1. **Aadhaar Number & Verhoeff Checksum (30 pts)**: Validates 12-digit format and Verhoeff checksum ($D_5$ group multiplication).
2. **Aadhaar & Government Keywords (35 pts)**: Identifies Hindi and English keywords ("GOVERNMENT OF INDIA", "UIDAI", "Aadhaar", "DOB", "MALE", "FEMALE", etc.).
3. **Name Match Ratio (15 pts)**: Computes Token-Sort, Token-Set, and Levenshtein similarity against user-entered holder name.
4. **Portrait & Face Verification (15 pts)**: Verifies facial landmarks and YCbCr skin-tone cluster density.
5. **Layout & Image Quality (5 pts)**: Analyzes blur score, brightness, glare, and document aspect ratio.

---

## Local Development

Start the dev server:

```bash
npm run dev
```

Then open in your browser:

```text
http://localhost:5500
```

---

## JavaScript Integration API

Embed PixelProof into any web application:

```javascript
// Open verification modal
PixelProof.openModal();

// Close verification modal
PixelProof.closeModal();

// Run verification programmatically
PixelProof.verify();

// Load instant synthetic sample case
PixelProof.loadSamplePreset('clear-aadhaar');
```

---

## License

MIT License. Developed by Harshvardhan Hajgude.
