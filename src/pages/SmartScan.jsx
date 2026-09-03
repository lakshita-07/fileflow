import { useEffect, useRef, useState } from "react"

import {
  applyFilters,
  detectDocumentCorners,
  perspectiveCorrect,
  rotateImage
} from "../utils/scanProcessing"

import { imagesToPDF, downloadBlob } from "../utils/pdfexport"


function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => resolve(img)
    img.onerror = reject

    img.src = src
  })
}


function imageToDataURL(
  img,
  type = "image/jpeg",
  quality = 0.9
) {
  const canvas = document.createElement("canvas")

  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height

  const ctx = canvas.getContext("2d")

  ctx.drawImage(img, 0, 0)

  return canvas.toDataURL(type, quality)
}


function dataURLToBlob(dataURL) {
  const parts = dataURL.split(",")

  const mime = parts[0].match(/:(.*?);/)[1]

  const binary = atob(parts[1])

  const array = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }

  return new Blob([array], { type: mime })
}


/* =========================================================
  FOUR-POINT CROP EDITOR
  ========================================================= */

function CropEditor({ corners, setCorners }) {
  const containerRef = useRef(null)
  const dragging = useRef(null)

  function startDrag(index, e) {
    e.preventDefault()
    e.stopPropagation()

    dragging.current = index

    window.addEventListener("pointermove", moveCorner)
    window.addEventListener("pointerup", stopDrag)
  }

  function moveCorner(e) {
    if (dragging.current === null) return

    const container = containerRef.current

    if (!container) return

    const rect = container.getBoundingClientRect()

    let x =
      ((e.clientX - rect.left) / rect.width) * 100

    let y =
      ((e.clientY - rect.top) / rect.height) * 100

    x = Math.max(2, Math.min(98, x))
    y = Math.max(2, Math.min(98, y))

    setCorners(prev => {
      const updated = [...prev]

      if (dragging.current === 0) {
        updated[0] = { x, y }
      }

      if (dragging.current === 1) {
        updated[1] = { x, y }
      }

      if (dragging.current === 2) {
        updated[2] = { x, y }
      }

      if (dragging.current === 3) {
        updated[3] = { x, y }
      }

      return updated
    })
  }

  function stopDrag() {
    dragging.current = null

    window.removeEventListener(
      "pointermove",
      moveCorner
    )

    window.removeEventListener(
      "pointerup",
      stopDrag
    )
  }

  const points = corners
    .map(corner => `${corner.x},${corner.y}`)
    .join(",")

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
    >

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <mask id="crop-mask">
            <rect width="100%" height="100%" fill="white" />
            <polygon points={points} fill="black" />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.45)"
          mask="url(#crop-mask)"
        />
        <polygon
          points={points}
          fill="none"
          stroke="#14251c"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {/* Corner handles */}
      {corners.map((corner, index) => (
        <button
          key={index}
          onPointerDown={e =>
            startDrag(index, e)
          }
          className="
            absolute
            w-9
            h-9
            rounded-full
            bg-white
            border-[4px]
            border-[#1b3125]
            shadow-xl
            pointer-events-auto
            cursor-crosshair
            touch-none
          "
          style={{
            left: `${corner.x}%`,
            top: `${corner.y}%`,
            transform:
              "translate(-50%, -50%)"
          }}
          aria-label={`Crop corner ${index + 1}`}
        />
      ))}

    </div>
  )
}


/* =========================================================
   MAIN SMART SCAN
   ========================================================= */

export default function SmartScan() {

  const fileInputRef = useRef(null)

  const cameraInputRef = useRef(null)

  const [selectedFile, setSelectedFile] =
    useState(null)

  const [originalImage, setOriginalImage] =
    useState(null)

  const [baseImage, setBaseImage] =
    useState(null)

  const [preview, setPreview] =
    useState(null)

  const [processedPreview, setProcessedPreview] =
    useState(null)

  const [corners, setCorners] = useState([
    { x: 8, y: 8 },
    { x: 92, y: 8 },
    { x: 92, y: 92 },
    { x: 8, y: 92 }
  ])

  const [autoDetect, setAutoDetect] =
    useState(true)

  const [perspectiveFix, setPerspectiveFix] =
    useState(true)

  const [removeShadows, setRemoveShadows] =
    useState(false)

  const [filter, setFilter] =
    useState("original")

  const [format, setFormat] =
    useState("PDF")

  const [sizeMode, setSizeMode] =
    useState("standard")

  const [customSize, setCustomSize] =
    useState(2)

  const [filename, setFilename] =
    useState("FileFlow_Scan")

  const [rotation, setRotation] =
    useState(0)

  const [pages, setPages] =
    useState([])

  const [currentPage, setCurrentPage] =
    useState(0)

  const [showCrop, setShowCrop] =
    useState(false)

  const [status, setStatus] =
    useState("")

  const [processing, setProcessing] =
    useState(false)

  const [cameraOpen, setCameraOpen] =
    useState(false)

  const videoRef = useRef(null)

  const streamRef = useRef(null)


  const filters = [
    {
      id: "original",
      name: "Original",
      description: "Keep natural colors"
    },
    {
      id: "auto",
      name: "Auto Enhance",
      description: "Balanced document enhancement"
    },
    {
      id: "gray",
      name: "Grayscale",
      description: "Clean gray document"
    },
    {
      id: "bw",
      name: "Black & White",
      description: "Sharp monochrome"
    },
    {
      id: "contrast",
      name: "High Contrast",
      description: "Stronger text contrast"
    },
    {
      id: "document",
      name: "Document",
      description: "Optimized for scanned pages"
    },
    {
      id: "soft",
      name: "Soft",
      description: "Gentler enhancement"
    }
  ]


  const sizeOptions = [
    {
      id: "standard",
      title: "Standard",
      subtitle: "Recommended",
      detail: "Good quality • ~2–4 MB"
    },
    {
      id: "small",
      title: "Small",
      subtitle: "Recommended",
      detail: "Smaller file • ~500 KB–2 MB"
    },
    {
      id: "custom",
      title: "Custom",
      subtitle: "Choose your size",
      detail: "Set your target size"
    }
  ]


  /* =========================================================
     HANDLE FILE
     ========================================================= */

  async function handleFile(file) {

    if (!file) return

    if (!file.type.startsWith("image/")) {
      setStatus(
        "For Smart Scan, please select an image."
      )
      return
    }

    setSelectedFile(file)

    const url =
      URL.createObjectURL(file)

    try {

      const img =
        await loadImage(url)

      setOriginalImage(img)

      setBaseImage(url)

      setPreview(url)

      setProcessedPreview(url)

      setPages([url])

      setCurrentPage(0)

      setRotation(0)

      setStatus("✓ Ready to scan")


      const defaultCorners = [
        { x: 8, y: 8 },
        { x: 92, y: 8 },
        { x: 92, y: 92 },
        { x: 8, y: 92 }
      ]

      setCorners(defaultCorners)


      if (autoDetect) {

        const detected =
          await detectDocumentCorners(img)

        if (detected) {

          setCorners(detected)

          setStatus(
            "✓ Document edges detected"
          )
        }
      }

    } catch {

      setStatus(
        "Unable to read this image."
      )
    }
  }


  function handleFileChange(e) {

    const file =
      e.target.files?.[0]

    if (file) {
      handleFile(file)
    }

    e.target.value = ""
  }


  /* =========================================================
     CAMERA
     ========================================================= */

  async function openCamera() {

    try {

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment"
          }
        })

      streamRef.current = stream

      setCameraOpen(true)

      setTimeout(() => {

        if (videoRef.current) {
          videoRef.current.srcObject =
            stream
        }

      }, 100)

    } catch {

      setStatus(
        "Camera permission was denied or unavailable."
      )
    }
  }


  function closeCamera() {

    if (streamRef.current) {

      streamRef.current
        .getTracks()
        .forEach(track =>
          track.stop()
        )

      streamRef.current = null
    }

    setCameraOpen(false)
  }


  async function captureCamera() {

    const video =
      videoRef.current

    if (!video) return

    const canvas =
      document.createElement("canvas")

    canvas.width =
      video.videoWidth

    canvas.height =
      video.videoHeight

    const ctx =
      canvas.getContext("2d")

    ctx.drawImage(
      video,
      0,
      0
    )

    canvas.toBlob(
      async blob => {

        if (!blob) return

        const file =
          new File(
            [blob],
            `Camera_Scan_${Date.now()}.jpg`,
            {
              type: "image/jpeg"
            }
          )

        closeCamera()

        await handleFile(file)

      },
      "image/jpeg",
      0.95
    )
  }


  /* =========================================================
     LIVE PREVIEW
     ========================================================= */

  async function applyLivePreview() {

    if (!baseImage) return

    setProcessing(true)

    try {

      let working =
        await loadImage(baseImage)


      if (perspectiveFix) {

        const corrected =
          await perspectiveCorrect(
            working,
            corners
          )

        if (corrected) {
          working = corrected
        }
      }


      const filtered =
        await applyFilters(
          working,
          filter,
          removeShadows
        )


      const rotated =
        rotateImage(
          filtered,
          rotation
        )


      setProcessedPreview(rotated)

      setStatus(
        "✓ Preview updated"
      )

    } catch (error) {

      console.error(error)

      setStatus(
        "Preview could not be updated."
      )
    }

    setProcessing(false)
  }


  useEffect(() => {

    const timer =
      setTimeout(() => {
        applyLivePreview()
      }, 150)

    return () =>
      clearTimeout(timer)

  }, [
    baseImage,
    corners,
    perspectiveFix,
    filter,
    removeShadows,
    rotation
  ])


  /* =========================================================
     SCAN DOCUMENT
     ========================================================= */

  async function scanDocument() {

    if (!baseImage) return

    setProcessing(true)

    setStatus(
      "Processing document..."
    )

    try {

      let working =
        await loadImage(baseImage)


      if (autoDetect) {

        const detected =
          await detectDocumentCorners(
            working
          )

        if (detected) {

          setCorners(detected)

          if (perspectiveFix) {

            const corrected =
              await perspectiveCorrect(
                working,
                detected
              )

            if (corrected) {
              working = corrected
            }
          }
        }

      } else if (perspectiveFix) {

        const corrected =
          await perspectiveCorrect(
            working,
            corners
          )

        if (corrected) {
          working = corrected
        }
      }


      const filtered =
        await applyFilters(
          working,
          filter,
          removeShadows
        )


      const rotated =
        rotateImage(
          filtered,
          rotation
        )


      setProcessedPreview(rotated)

      setStatus(
        "✓ Scan processed"
      )

    } catch (error) {

      console.error(error)

      setStatus(
        "Could not process document."
      )
    }

    setProcessing(false)
  }


  /* =========================================================
     RESET CROP
     ========================================================= */

  function resetCorners() {

    setCorners([
      { x: 8, y: 8 },
      { x: 92, y: 8 },
      { x: 92, y: 92 },
      { x: 8, y: 92 }
    ])

    setStatus(
      "Crop box reset"
    )
  }


    /* =========================================================
      APPLY FOUR-SIDED CROP
      ========================================================= */

  async function applyCrop() {

    if (!baseImage) return

    setProcessing(true)

    setStatus(
      "Cropping image..."
    )

    try {

      const img =
        await loadImage(baseImage)


      const pixelCorners = corners.map(corner => ({
        x: img.naturalWidth * corner.x / 100,
        y: img.naturalHeight * corner.y / 100
      }))

      const sx = Math.floor(Math.min(...pixelCorners.map(corner => corner.x)))
      const sy = Math.floor(Math.min(...pixelCorners.map(corner => corner.y)))
      const ex = Math.ceil(Math.max(...pixelCorners.map(corner => corner.x)))
      const ey = Math.ceil(Math.max(...pixelCorners.map(corner => corner.y)))
      const sw = ex - sx
      const sh = ey - sy


      if (sw <= 0 || sh <= 0) {

        setStatus(
          "Invalid crop area."
        )

        setProcessing(false)

        return
      }


      const canvas =
        document.createElement("canvas")

      canvas.width = sw

      canvas.height = sh


      const ctx =
        canvas.getContext("2d")


      ctx.beginPath()
      pixelCorners.forEach((corner, index) => {
        const x = corner.x - sx
        const y = corner.y - sy

        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, -sx, -sy)


      const cropped = canvas.toDataURL("image/png")


      /*
       * The cropped image becomes the new
       * working source.
       */
      setBaseImage(cropped)

      setPreview(cropped)

      setProcessedPreview(cropped)


      setCorners([
        { x: 2, y: 2 },
        { x: 98, y: 2 },
        { x: 98, y: 98 },
        { x: 2, y: 98 }
      ])


      setShowCrop(false)

      setStatus(
        "✓ Crop applied"
      )

    } catch (error) {

      console.error(error)

      setStatus(
        "Crop failed."
      )
    }

    setProcessing(false)
  }


  /* =========================================================
     ROTATION
     ========================================================= */

  function rotateLeft() {

    setRotation(
      prev =>
        (prev - 90 + 360) % 360
    )
  }


  function rotateRight() {

    setRotation(
      prev =>
        (prev + 90) % 360
    )
  }


  /* =========================================================
     ADD PAGE
     ========================================================= */

  async function addPage() {

    fileInputRef.current?.click()
  }


  async function addPageFromFile(e) {

    const file =
      e.target.files?.[0]

    if (!file) return

    if (!file.type.startsWith("image/")) {

      setStatus(
        "Please select an image."
      )

      return
    }


    const url =
      URL.createObjectURL(file)


    try {

      const img =
        await loadImage(url)


      let detectedCorners = [
        { x: 8, y: 8 },
        { x: 92, y: 8 },
        { x: 92, y: 92 },
        { x: 8, y: 92 }
      ]


      if (autoDetect) {

        const detected =
          await detectDocumentCorners(
            img
          )

        if (detected) {
          detectedCorners =
            detected
        }
      }


      let working = img


      if (perspectiveFix) {

        const corrected =
          await perspectiveCorrect(
            working,
            detectedCorners
          )

        if (corrected) {
          working = corrected
        }
      }


      const filtered =
        await applyFilters(
          working,
          filter,
          removeShadows
        )


      const rotated =
        rotateImage(
          filtered,
          0
        )


      setPages(prev => [
        ...prev,
        rotated
      ])


      setCurrentPage(
        pages.length
      )


      setStatus(
        `✓ Page ${pages.length + 1} added`
      )

    } catch {

      setStatus(
        "Could not add page."
      )
    }

    e.target.value = ""
  }


  /* =========================================================
     PAGE MANAGEMENT
     ========================================================= */

  function deletePage(index) {

    if (pages.length <= 1) {

      setStatus(
        "At least one page is required."
      )

      return
    }


    const updated =
      pages.filter(
        (_, i) =>
          i !== index
      )


    setPages(updated)


    setCurrentPage(
      Math.min(
        currentPage,
        updated.length - 1
      )
    )
  }


  function movePageLeft(index) {

    if (index === 0) return

    const updated =
      [...pages]


    const temp =
      updated[index - 1]

    updated[index - 1] =
      updated[index]

    updated[index] =
      temp


    setPages(updated)

    setCurrentPage(
      index - 1
    )
  }


  function movePageRight(index) {

    if (
      index ===
      pages.length - 1
    ) {
      return
    }


    const updated =
      [...pages]


    const temp =
      updated[index + 1]

    updated[index + 1] =
      updated[index]

    updated[index] =
      temp


    setPages(updated)

    setCurrentPage(
      index + 1
    )
  }


  /* =========================================================
     EXPORT
     ========================================================= */

  async function exportFile() {

    if (!processedPreview) {

      setStatus(
        "Select an image before exporting."
      )

      return
    }


    setProcessing(true)

    setStatus(
      "Preparing export..."
    )


    try {

      let cleanName =
        filename.trim()


      if (!cleanName) {
        cleanName =
          "FileFlow_Scan"
      }


      cleanName =
        cleanName.replace(
          /\.(pdf|jpg|jpeg|png)$/i,
          ""
        )


      const exportImage =
        processedPreview


      const img =
        await loadImage(
          exportImage
        )


      /* =========================
         PDF
         ========================= */

      if (format === "PDF") {

        let quality = 0.9

        if (sizeMode === "small") {
          quality = 0.65
        }

        if (sizeMode === "standard") {
          quality = 0.85
        }

        const imageData =
          imageToDataURL(
            img,
            "image/jpeg",
            quality
          )


        const pdfBlob =
          await imagesToPDF(
            [imageData],
            `${cleanName}.pdf`
          )


        downloadBlob(
          pdfBlob,
          `${cleanName}.pdf`
        )
      }


      /* =========================
         PNG
         ========================= */

      else if (format === "PNG") {

        const canvas =
          document.createElement(
            "canvas"
          )


        canvas.width =
          img.naturalWidth

        canvas.height =
          img.naturalHeight


        const ctx =
          canvas.getContext("2d")


        ctx.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        )


        const blob =
          await new Promise(
            resolve => {

              canvas.toBlob(
                resolve,
                "image/png"
              )
            }
          )


        downloadBlob(
          blob,
          `${cleanName}.png`
        )
      }


      /* =========================
         JPG
         ========================= */

      else {

        let quality = 0.9


        if (
          sizeMode === "small"
        ) {
          quality = 0.6
        }


        if (
          sizeMode === "standard"
        ) {
          quality = 0.85
        }


        if (
          sizeMode === "custom"
        ) {

          const targetBytes =
            Number(customSize) *
            1024 *
            1024


          let low = 0.1

          let high = 1

          let bestBlob = null


          for (
            let i = 0;
            i < 8;
            i++
          ) {

            const testQuality =
              (low + high) / 2


            const data =
              imageToDataURL(
                img,
                "image/jpeg",
                testQuality
              )


            const blob =
              dataURLToBlob(data)


            if (
              blob.size <=
              targetBytes
            ) {

              bestBlob = blob

              low =
                testQuality

            } else {

              high =
                testQuality
            }
          }


          if (bestBlob) {

            downloadBlob(
              bestBlob,
              `${cleanName}.jpg`
            )


            setStatus(
              "✓ File exported successfully"
            )


            setProcessing(false)

            return
          }


          quality = 0.1
        }


        const data =
          imageToDataURL(
            img,
            "image/jpeg",
            quality
          )


        const blob =
          dataURLToBlob(data)


        downloadBlob(
          blob,
          `${cleanName}.jpg`
        )
      }


      setStatus(
        "✓ File exported successfully"
      )

    } catch (error) {

      console.error(error)

      setStatus(
        "Export failed."
      )
    }


    setProcessing(false)
  }


  /* =========================================================
     UI
     ========================================================= */

  return (

    <div className="min-h-screen bg-[#f4fbf9] text-[#1a1f1d]">

      <main className="max-w-[1280px] mx-auto px-6 py-8">

        {/* HEADER */}

        <div className="mb-7">

          <h1 className="text-3xl font-bold text-[#31473a]">
            Smart Scan
          </h1>

          <p className="mt-2 text-[#424844]">
            Scan, correct, enhance and export documents directly in your browser.
          </p>

        </div>


        {/* FILE SELECTION */}

        <div className="bg-[#edf4f2] border border-[#c2c8c2] rounded-xl p-5 mb-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

            <div>

              <h2 className="font-bold text-lg">

                {selectedFile
                  ? "Selected File"
                  : "Select a document"}

              </h2>


              {selectedFile ? (

                <div className="mt-2 flex items-center gap-3">

                  {preview && (

                    <img
                      src={preview}
                      className="w-16 h-16 object-cover rounded-lg border border-[#c2c8c2]"
                    />

                  )}


                  <div>

                    <p className="font-semibold">
                      {selectedFile.name}
                    </p>

                    <p className="text-sm text-[#424844]">
                      {fileSize(selectedFile.size)}
                    </p>

                    <p className="text-sm text-[#1b3125] font-semibold mt-1">
                      {status || "✓ Ready to scan"}
                    </p>

                  </div>

                </div>

              ) : (

                <p className="text-sm text-[#424844] mt-1">
                  Select an image or capture one with your camera.
                </p>

              )}

            </div>


            <div className="flex gap-3 flex-wrap">

              <button
                onClick={openCamera}
                className="px-5 py-3 rounded-lg bg-[#1b3125] text-white font-semibold"
              >
                📷 Scan with Camera
              </button>


              <button
                onClick={() =>
                  fileInputRef.current?.click()
                }
                className="px-5 py-3 rounded-lg border border-[#737973] font-semibold"
              >
                Select Image
              </button>

            </div>

          </div>


          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={e => {

              if (!e.target.files?.length) {
                return
              }

              if (!selectedFile) {

                handleFile(
                  e.target.files[0]
                )

              } else {

                addPageFromFile(e)
              }

            }}
          />


          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
          />

        </div>


        {/* MAIN AREA */}

        <div className="grid lg:grid-cols-[1fr_340px] gap-6">


          {/* PREVIEW */}

          <section className="bg-[#edf4f2] border border-[#c2c8c2] rounded-xl p-5">

            <div className="flex items-center justify-between mb-4">

              <h2 className="text-lg font-bold">
                Live Preview
              </h2>


              <div className="flex gap-2">

                <button
                  onClick={rotateLeft}
                  disabled={!baseImage}
                  className="px-3 py-2 border border-[#737973] rounded-lg"
                >
                  ↶
                </button>


                <button
                  onClick={rotateRight}
                  disabled={!baseImage}
                  className="px-3 py-2 border border-[#737973] rounded-lg"
                >
                  ↷
                </button>


                <button
                  onClick={() =>
                    setShowCrop(
                      !showCrop
                    )
                  }
                  disabled={!baseImage}
                  className={`
                    px-4
                    py-2
                    rounded-lg
                    border
                    font-semibold
                    ${
                      showCrop
                        ? "bg-[#1b3125] text-white"
                        : ""
                    }
                  `}
                >
                  Crop
                </button>

              </div>

            </div>


            {!processedPreview ? (

              <div className="min-h-[520px] rounded-xl border-2 border-dashed border-[#c2c8c2] flex items-center justify-center text-[#737973]">

                Select or capture a document to begin.

              </div>

            ) : (

              <div className="relative bg-[#e2eae7] rounded-xl p-5 flex justify-center min-h-[520px]">

                <div className="relative inline-block max-w-full max-h-[650px]">

                  <img
                    src={
                      showCrop
                        ? baseImage
                        : processedPreview
                    }
                    className="max-h-[650px] max-w-full object-contain rounded-lg shadow-sm"
                  />


                  {showCrop && (

                    <CropEditor
                      corners={corners}
                      setCorners={setCorners}
                    />

                  )}

                </div>

              </div>

            )}


            {/* CROP CONTROLS */}

            {showCrop && baseImage && (

              <div className="mt-4 p-4 bg-[#f4fbf9] border border-[#c2c8c2] rounded-lg">

                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">

                  <div>

                    <p className="font-bold">
                      Crop Image
                    </p>

                    <p className="text-sm text-[#424844]">
                      Drag the four corners to select any four-sided area to keep.
                    </p>

                  </div>


                  <div className="flex gap-2">

                    <button
                      onClick={resetCorners}
                      disabled={processing}
                      className="px-4 py-2 border border-[#737973] rounded-lg font-semibold disabled:opacity-50"
                    >
                      Reset
                    </button>


                    <button
                      onClick={applyCrop}
                      disabled={processing}
                      className="px-4 py-2 bg-[#1b3125] text-white rounded-lg font-semibold disabled:opacity-50"
                    >
                      Apply Crop
                    </button>

                  </div>

                </div>

              </div>

            )}


            {/* PAGES */}

            <div className="mt-6">

              <div className="flex items-center justify-between mb-3">

                <h3 className="font-bold">
                  Pages ({pages.length})
                </h3>


                <button
                  onClick={addPage}
                  className="px-4 py-2 bg-[#dce3be] rounded-lg font-semibold"
                >
                  + Add Page
                </button>

              </div>


              <div className="flex gap-3 overflow-x-auto pb-2">

                {pages.map(
                  (page, index) => (

                    <div
                      key={index}
                      className={`
                        relative
                        flex-shrink-0
                        border-2
                        rounded-lg
                        p-1
                        ${
                          currentPage === index
                            ? "border-[#1b3125]"
                            : "border-[#c2c8c2]"
                        }
                      `}
                    >

                      <button
                        onClick={() =>
                          setCurrentPage(
                            index
                          )
                        }
                      >

                        <img
                          src={page}
                          className="w-20 h-24 object-cover rounded"
                        />

                      </button>


                      <div className="text-center text-xs font-semibold mt-1">
                        {index + 1}
                      </div>


                      <div className="flex gap-1 mt-1 justify-center">

                        <button
                          onClick={() =>
                            movePageLeft(index)
                          }
                          className="text-xs px-1 border rounded"
                        >
                          ←
                        </button>


                        <button
                          onClick={() =>
                            movePageRight(index)
                          }
                          className="text-xs px-1 border rounded"
                        >
                          →
                        </button>


                        <button
                          onClick={() =>
                            deletePage(index)
                          }
                          className="text-xs px-1 border rounded"
                        >
                          ×
                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            </div>

          </section>


          {/* SETTINGS */}

          <aside className="space-y-5">


            {/* ENHANCEMENTS */}

            <div className="bg-[#edf4f2] border border-[#c2c8c2] rounded-xl p-5">

              <h2 className="text-lg font-bold mb-4">
                Enhancements
              </h2>


              <label className="flex items-start justify-between gap-4 mb-5">

                <div>

                  <p className="font-semibold">
                    Auto-Detect Edges
                  </p>

                  <p className="text-xs text-[#424844]">
                    Find document boundaries automatically.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={e =>
                    setAutoDetect(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5"
                />

              </label>


              <label className="flex items-start justify-between gap-4 mb-5">

                <div>

                  <p className="font-semibold">
                    Perspective Fix
                  </p>

                  <p className="text-xs text-[#424844]">
                    Straighten tilted documents.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={perspectiveFix}
                  onChange={e =>
                    setPerspectiveFix(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5"
                />

              </label>


              <label className="flex items-start justify-between gap-4">

                <div>

                  <p className="font-semibold">
                    Remove Shadows
                  </p>

                  <p className="text-xs text-[#424844]">
                    Reduce dark background areas.
                  </p>

                </div>


                <input
                  type="checkbox"
                  checked={removeShadows}
                  onChange={e =>
                    setRemoveShadows(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5"
                />

              </label>

            </div>


            {/* FILTERS */}

            <div className="bg-[#edf4f2] border border-[#c2c8c2] rounded-xl p-5">

              <h2 className="text-lg font-bold mb-4">
                Filters
              </h2>


              <div className="grid grid-cols-2 gap-2">

                {filters.map(
                  item => (

                    <button
                      key={item.id}
                      onClick={() =>
                        setFilter(
                          item.id
                        )
                      }
                      className={`
                        p-3
                        rounded-lg
                        border
                        text-left
                        ${
                          filter === item.id
                            ? "bg-[#1b3125] text-white border-[#1b3125]"
                            : "border-[#737973]"
                        }
                      `}
                    >

                      <p className="font-semibold text-sm">
                        {item.name}
                      </p>


                      <p
                        className={`
                          text-xs
                          mt-1
                          ${
                            filter === item.id
                              ? "text-white/80"
                              : "text-[#737973]"
                          }
                        `}
                      >
                        {item.description}
                      </p>

                    </button>

                  )
                )}

              </div>

            </div>


            {/* OUTPUT */}

            <div className="bg-[#edf4f2] border border-[#c2c8c2] rounded-xl p-5">

              <h2 className="text-lg font-bold mb-4">
                Output Settings
              </h2>


              <p className="font-semibold text-sm mb-2">
                Format
              </p>


              <div className="grid grid-cols-3 gap-2 mb-5">

                {[
                  "PDF",
                  "JPG",
                  "PNG"
                ].map(item => (

                  <button
                    key={item}
                    onClick={() =>
                      setFormat(item)
                    }
                    className={`
                      py-3
                      rounded-lg
                      border
                      font-semibold
                      ${
                        format === item
                          ? "bg-[#1b3125] text-white"
                          : "border-[#737973]"
                      }
                    `}
                  >
                    {item}
                  </button>

                ))}

              </div>


              <p className="font-semibold text-sm mb-2">
                Recommended Size
              </p>


              <div className="space-y-2">

                {sizeOptions.map(
                  option => (

                    <button
                      key={option.id}
                      onClick={() =>
                        setSizeMode(
                          option.id
                        )
                      }
                      className={`
                        w-full
                        text-left
                        p-3
                        rounded-lg
                        border
                        ${
                          sizeMode === option.id
                            ? "border-[#1b3125] bg-[#dce3be]"
                            : "border-[#737973]"
                        }
                      `}
                    >

                      <div className="flex justify-between">

                        <div>

                          <p className="font-bold">
                            {option.title}
                          </p>

                          <p className="text-xs">
                            {option.subtitle}
                          </p>

                        </div>


                        {sizeMode === option.id && (
                          <span>
                            ✓
                          </span>
                        )}

                      </div>


                      <p className="text-xs mt-1 text-[#424844]">
                        {option.detail}
                      </p>

                    </button>

                  )
                )}

              </div>


              {/* CUSTOM SIZE */}

              {sizeMode === "custom" && (

                <div className="mt-4">

                  <label className="font-semibold text-sm">
                    Target file size
                  </label>


                  <div className="flex gap-2 mt-2">

                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      value={customSize}
                      onChange={e =>
                        setCustomSize(
                          e.target.value
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-[#737973] bg-white"
                    />


                    <span className="flex items-center">
                      MB
                    </span>

                  </div>

                </div>

              )}


              {/* FILENAME */}

              <div className="mt-5">

                <label className="font-semibold text-sm">
                  File name
                </label>


                <input
                  value={filename}
                  onChange={e =>
                    setFilename(
                      e.target.value
                    )
                  }
                  placeholder="My_Scanned_Document"
                  className="w-full mt-2 px-3 py-3 rounded-lg border border-[#737973] bg-white"
                />


                <p className="text-xs text-[#737973] mt-1">
                  .{format.toLowerCase()} will be added automatically.
                </p>

              </div>


              {/* ACTIONS */}

              <button
                onClick={scanDocument}
                disabled={
                  !baseImage ||
                  processing
                }
                className="w-full mt-5 py-3 rounded-lg bg-[#1b3125] text-white font-bold disabled:opacity-50"
              >

                {processing
                  ? "Processing..."
                  : "Scan Document →"}

              </button>


              <button
                onClick={exportFile}
                disabled={
                  !processedPreview ||
                  processing
                }
                className="w-full mt-3 py-3 rounded-lg border border-[#1b3125] font-bold disabled:opacity-50"
              >
                Scan & Export
              </button>


              <p className="text-xs text-center text-[#737973] mt-3">
                Your files are processed locally in your browser.
              </p>

            </div>

          </aside>

        </div>

      </main>


      {/* CAMERA MODAL */}

      {cameraOpen && (

        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-5">

          <div className="bg-[#f4fbf9] rounded-xl p-5 max-w-2xl w-full">

            <div className="flex justify-between items-center mb-4">

              <h2 className="text-xl font-bold">
                Scan with Camera
              </h2>


              <button
                onClick={closeCamera}
                className="text-xl"
              >
                ×
              </button>

            </div>


            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg bg-black"
            />


            <button
              onClick={captureCamera}
              className="w-full mt-4 py-4 bg-[#1b3125] text-white rounded-lg font-bold"
            >
              Capture Document
            </button>

          </div>

        </div>

      )}

    </div>
  )
}