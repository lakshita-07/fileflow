# FileFlow

FileFlow is a privacy-focused file utility suite that processes files locally in the browser. It provides document scanning, image conversion, compression, resizing, and PDF utilities without requiring uploads or an account.

## Features

- **Smart Scan:** Capture documents with the device camera or select an image, detect document edges with OpenCV.js, adjust crop corners, apply image filters, and export scans as PDFs.
- **Convert:** Convert images between JPG, PNG, WebP, and PDF.
- **Smart Compress:** Compress images with maximum-reduction, balanced, and high-quality presets.
- **Resize:** Resize images by exact dimensions or percentage and export them as JPG, PNG, or WebP.
- **PDF Tools:** Merge PDFs, extract selected pages, and rotate PDF pages.
- **Local-first privacy:** File processing happens in the browser, so files are not uploaded to a server.

## Tech Stack

- React 19
- Vite
- Tailwind CSS
- OpenCV.js for document detection and perspective correction
- Tesseract.js for OCR capabilities
- pdf-lib and pdfjs-dist for PDF processing
- Local system fonts with no external font requests

## Getting Started

### Requirements

- Node.js (an active LTS version is recommended)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open the local URL printed by Vite in your browser.

### Production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

### Lint

```bash
npm run lint
```

## Privacy

FileFlow is designed for local, browser-based processing. Camera access is requested through the browser and captured frames are processed in memory using the canvas API and OpenCV.js. Selected files are transformed in memory and downloaded directly to the device.

FileFlow does not upload or store camera images, documents, or generated files. The Vercel deployment serves the application, but it does not receive user files. Camera access requires user permission and HTTPS in production; `localhost` is also supported during development.
