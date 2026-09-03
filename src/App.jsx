import { useEffect, useRef, useState } from "react"
import cv from "@techstark/opencv-js"
import { PDFDocument } from "pdf-lib"
import SmartScanPage from "./pages/SmartScan"

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const formatBytes = (bytes) => {
  if (!bytes) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const imageToDataURL = async (src, format = "image/jpeg", quality = 0.9) => {
  const img = await loadImage(src)

  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext("2d")
  ctx.drawImage(img, 0, 0)

  return canvas.toDataURL(format, quality)
}

const dataURLToBlob = async (dataURL) => {
  const response = await fetch(dataURL)
  return await response.blob()
}

const orderPoints = (points) => {
  const sorted = [...points]

  const sum = (p) => p.x + p.y
  const diff = (p) => p.x - p.y

  const topLeft = sorted.reduce((a, b) =>
    sum(a) < sum(b) ? a : b
  )

  const bottomRight = sorted.reduce((a, b) =>
    sum(a) > sum(b) ? a : b
  )

  const topRight = sorted.reduce((a, b) =>
    diff(a) > diff(b) ? a : b
  )

  const bottomLeft = sorted.reduce((a, b) =>
    diff(a) < diff(b) ? a : b
  )

  return [topLeft, topRight, bottomRight, bottomLeft]
}

const distance = (a, b) =>
  Math.sqrt(
    Math.pow(a.x - b.x, 2) +
      Math.pow(a.y - b.y, 2)
  )

const matToDataURL = (mat) => {
  const canvas = document.createElement("canvas")

  canvas.width = mat.cols
  canvas.height = mat.rows

  cv.imshow(canvas, mat)

  return canvas.toDataURL("image/jpeg", 0.95)
}

const detectAndWarpDocument = (src) => {
  return new Promise(async (resolve) => {
    let original = null
    let resized = null
    let gray = null
    let blurred = null
    let edges = null
    let dilated = null
    let contours = null
    let hierarchy = null

    try {
      const img = await loadImage(src)

      const sourceCanvas = document.createElement("canvas")
      sourceCanvas.width = img.naturalWidth
      sourceCanvas.height = img.naturalHeight

      const sourceCtx = sourceCanvas.getContext("2d")
      sourceCtx.drawImage(img, 0, 0)

      original = cv.imread(sourceCanvas)

      const limitWidth = 1200

      let scale = 1

      if (original.cols > limitWidth) {
        scale = limitWidth / original.cols
      }

      const width = Math.round(original.cols * scale)
      const height = Math.round(original.rows * scale)

      resized = new cv.Mat()

      cv.resize(
        original,
        resized,
        new cv.Size(width, height),
        0,
        0,
        cv.INTER_AREA
      )

      gray = new cv.Mat()

      cv.cvtColor(
        resized,
        gray,
        cv.COLOR_RGBA2GRAY
      )

      blurred = new cv.Mat()

      cv.GaussianBlur(
        gray,
        blurred,
        new cv.Size(5, 5),
        0
      )

      edges = new cv.Mat()

      cv.Canny(
        blurred,
        edges,
        50,
        150
      )

      const kernel = cv.Mat.ones(
        5,
        5,
        cv.CV_8U
      )

      dilated = new cv.Mat()

      cv.dilate(
        edges,
        dilated,
        kernel
      )

      kernel.delete()

      contours = new cv.MatVector()
      hierarchy = new cv.Mat()

      cv.findContours(
        dilated,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE
      )

      const candidates = []

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)

        const area = cv.contourArea(contour)

        if (area < resized.cols * resized.rows * 0.10) {
          contour.delete()
          continue
        }

        const perimeter = cv.arcLength(
          contour,
          true
        )

        const approx = new cv.Mat()

        cv.approxPolyDP(
          contour,
          approx,
          0.02 * perimeter,
          true
        )

        if (approx.rows === 4) {
          const points = []

          for (let j = 0; j < 4; j++) {
            points.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1],
            })
          }

          candidates.push({
            area,
            points,
          })
        }

        approx.delete()
        contour.delete()
      }

      candidates.sort((a, b) => b.area - a.area)

      if (candidates.length === 0) {
        resolve({
          success: false,
          reason: "Document edges not detected",
          image: src,
        })

        return
      }

      const best = candidates[0]

      const points = orderPoints(best.points)

      const [tl, tr, br, bl] = points

      const widthTop = distance(tl, tr)
      const widthBottom = distance(bl, br)

      const maxWidth = Math.round(
        Math.max(widthTop, widthBottom)
      )

      const heightRight = distance(tr, br)
      const heightLeft = distance(tl, bl)

      const maxHeight = Math.round(
        Math.max(heightRight, heightLeft)
      )

      if (
        maxWidth < 100 ||
        maxHeight < 100
      ) {
        resolve({
          success: false,
          reason: "Detected document is too small",
          image: src,
        })

        return
      }

      const srcPoints = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [
          tl.x,
          tl.y,
          tr.x,
          tr.y,
          br.x,
          br.y,
          bl.x,
          bl.y,
        ]
      )

      const dstPoints = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        [
          0,
          0,
          maxWidth - 1,
          0,
          maxWidth - 1,
          maxHeight - 1,
          0,
          maxHeight - 1,
        ]
      )

      const transform = cv.getPerspectiveTransform(
        srcPoints,
        dstPoints
      )

      const warped = new cv.Mat()

      cv.warpPerspective(
        resized,
        warped,
        transform,
        new cv.Size(
          maxWidth,
          maxHeight
        )
      )

      const result = matToDataURL(warped)

      srcPoints.delete()
      dstPoints.delete()
      transform.delete()
      warped.delete()

      resolve({
        success: true,
        image: result,
        points,
      })
    } catch (error) {
      resolve({
        success: false,
        reason: "OpenCV processing failed",
        image: src,
      })
    } finally {
      if (original) original.delete()
      if (resized) resized.delete()
      if (gray) gray.delete()
      if (blurred) blurred.delete()
      if (edges) edges.delete()
      if (dilated) dilated.delete()
      if (contours) contours.delete()
      if (hierarchy) hierarchy.delete()
    }
  })
}

const processImage = async (
  src,
  {
    perspective = false,
    shadows = false,
    grayscale = false,
    bw = false,
  }
) => {
  let current = src

  if (perspective) {
    const result = await detectAndWarpDocument(current)

    current = result.image
  }

  if (
    shadows ||
    grayscale ||
    bw
  ) {
    current = await applyImageFilters(
      current,
      {
        shadows,
        grayscale,
        bw,
      }
    )
  }

  return current
}

const applyImageFilters = async (
  src,
  {
    shadows,
    grayscale,
    bw,
  }
) => {
  const img = await loadImage(src)

  const canvas = document.createElement("canvas")

  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight

  const ctx = canvas.getContext("2d")

  ctx.drawImage(img, 0, 0)

  const imageData = ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  )

  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]

    if (shadows) {
      const brightness =
        (r + g + b) / 3

      if (brightness < 100) {
        r = Math.min(
          255,
          r + 35
        )

        g = Math.min(
          255,
          g + 35
        )

        b = Math.min(
          255,
          b + 35
        )
      }
    }

    if (grayscale || bw) {
      const value =
        0.299 * r +
        0.587 * g +
        0.114 * b

      r = value
      g = value
      b = value
    }

    if (bw) {
      const value =
        0.299 * r +
        0.587 * g +
        0.114 * b

      const threshold =
        value > 150 ? 255 : 0

      r = threshold
      g = threshold
      b = threshold
    }

    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }

  ctx.putImageData(
    imageData,
    0,
    0
  )

  return canvas.toDataURL(
    "image/jpeg",
    0.95
  )
}

const Header = ({ page, setPage }) => {
  const links = [
    ["Dashboard", "dashboard"],
    ["Smart Scan", "scan"],
    ["Convert", "convert"],
    ["Compress", "compress"],
    ["Resize", "resize"],
    ["PDF Tools", "pdf"],
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant bg-background">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 lg:px-10">

        <button
          onClick={() => setPage("dashboard")}
          className="flex items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white font-bold">
            F
          </div>

          <span className="text-xl font-bold text-primary">
            FileFlow
          </span>
        </button>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map(([label, value]) => (
            <button
              key={value}
              onClick={() => setPage(value)}
              className={`text-sm font-medium transition ${
                page === value
                  ? "text-primary font-bold"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="hidden rounded-full border border-outline-variant px-3 py-1.5 text-xs font-semibold text-primary md:block">
          ✓ 100% Private
        </div>
      </div>
    </header>
  )
}

const ToolLayout = ({
  title,
  description,
  children,
}) => (
  <main className="mx-auto max-w-[1280px] px-5 py-8 lg:px-10">
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-primary-heading">
        {title}
      </h1>

      <p className="mt-2 text-on-surface-variant">
        {description}
      </p>
    </div>

    {children}
  </main>
)

const Panel = ({ title, children }) => (
  <section className="rounded-xl border border-outline-variant bg-surface p-5">
    {title && (
      <h2 className="mb-4 text-lg font-bold text-primary-heading">
        {title}
      </h2>
    )}

    {children}
  </section>
)

const Dashboard = ({ setPage }) => {
  const tools = [
    [
      "Smart Scan",
      "Detect, clean and scan documents.",
      "scan",
    ],
    [
      "Convert",
      "Convert images between formats.",
      "convert",
    ],
    [
      "Compress",
      "Reduce file size intelligently.",
      "compress",
    ],
    [
      "Resize",
      "Resize images quickly.",
      "resize",
    ],
    [
      "PDF Tools",
      "Merge and split PDF files.",
      "pdf",
    ],
  ]

  return (
    <main className="mx-auto max-w-[1280px] px-5 py-14 lg:px-10">

      <div className="mb-14 max-w-3xl">
        <div className="mb-4 inline-flex rounded-full border border-outline-variant bg-surface px-4 py-2 text-sm font-semibold text-primary">
          Zero Data Collection
        </div>

        <h1 className="text-5xl font-bold leading-tight text-primary-heading">
          Professional File Utilities,
          <br />
          Privately in your Browser.
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-8 text-on-surface-variant">
          No uploads, no accounts, 100% local processing.
          Your files never leave your device.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(([title, description, page]) => (
          <button
            key={page}
            onClick={() => setPage(page)}
            className="group rounded-xl border border-outline-variant bg-surface p-6 text-left transition hover:-translate-y-1 hover:border-primary"
          >
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-container text-primary">
              {title === "Smart Scan" && "⌕"}
              {title === "Convert" && "⇄"}
              {title === "Compress" && "↓"}
              {title === "Resize" && "↗"}
              {title === "PDF Tools" && "▤"}
            </div>

            <h2 className="text-xl font-bold text-primary-heading">
              {title}
            </h2>

            <p className="mt-2 text-sm leading-6 text-on-surface-variant">
              {description}
            </p>

            <div className="mt-5 text-sm font-bold text-primary">
              Open tool →
            </div>
          </button>
        ))}

        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 opacity-60">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container">
            ✦
          </div>

          <h2 className="text-xl font-bold text-primary-heading">
            Smart Organize
          </h2>

          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            AI-assisted local file organization.
          </p>

          <div className="mt-5 text-xs font-bold uppercase tracking-wider text-secondary">
            Coming Soon
          </div>
        </div>
      </div>
    </main>
  )
}

const SmartScan = () => {
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [pages, setPages] = useState([])

  const [cameraOpen, setCameraOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [message, setMessage] = useState("")

  const [autoDetect, setAutoDetect] = useState(true)
  const [perspectiveFix, setPerspectiveFix] = useState(true)
  const [removeShadows, setRemoveShadows] = useState(false)
  const [grayscale, setGrayscale] = useState(false)
  const [blackWhite, setBlackWhite] = useState(false)

  const [format, setFormat] = useState("PDF")
  const [compression, setCompression] = useState("Balanced")

  const [selectedPage, setSelectedPage] = useState(0)

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => track.stop())
      }
    }
  }, [])

  useEffect(() => {
    if (
      cameraOpen &&
      videoRef.current &&
      streamRef.current
    ) {
      videoRef.current.srcObject =
        streamRef.current
    }
  }, [cameraOpen])

  const startCamera = async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        })

      streamRef.current = stream

      setCameraOpen(true)
      setMessage("")
    } catch (error) {
      setMessage(
        "Camera access was denied or is unavailable."
      )
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => track.stop())

      streamRef.current = null
    }

    setCameraOpen(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current) return

    const video = videoRef.current

    const canvas =
      document.createElement("canvas")

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext("2d")

    ctx.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    )

    const dataURL =
      canvas.toDataURL(
        "image/jpeg",
        0.95
      )

    const capturedFile =
      new File(
        [
          dataURLToBlob(dataURL),
        ],
        `camera-scan-${Date.now()}.jpg`,
        {
          type: "image/jpeg",
        }
      )

    dataURLToBlob(dataURL).then(
      (blob) => {
        const realFile = new File(
          [blob],
          `camera-scan-${Date.now()}.jpg`,
          {
            type: "image/jpeg",
          }
        )

        setFile(realFile)
      }
    )

    setPreview(dataURL)

    setPages([
      {
        id: Date.now(),
        original: dataURL,
        processed: dataURL,
        name: `camera-scan.jpg`,
        size: Math.round(
          dataURL.length * 0.75
        ),
      },
    ])

    stopCamera()
  }

  const handleFile = (selectedFile) => {
    if (!selectedFile) return

    if (
      !selectedFile.type.startsWith(
        "image/"
      )
    ) {
      setMessage(
        "For Smart Scan, please select an image."
      )

      return
    }

    setFile(selectedFile)

    const reader =
      new FileReader()

    reader.onload = () => {
      const result = reader.result

      setPreview(result)

      setPages([
        {
          id: Date.now(),
          original: result,
          processed: result,
          name: selectedFile.name,
          size: selectedFile.size,
        },
      ])
    }

    reader.readAsDataURL(
      selectedFile
    )

    setMessage("")
  }

  const handleInput = (e) => {
    handleFile(
      e.target.files?.[0]
    )
  }

  const scanDocument = async () => {
    if (!pages.length) return

    setScanning(true)
    setMessage("Detecting document edges...")

    try {
      const page = pages[selectedPage]

      let result =
        page.original

      if (
        autoDetect ||
        perspectiveFix
      ) {
        const detection =
          await detectAndWarpDocument(
            page.original
          )

        if (detection.success) {
          result = detection.image

          setMessage(
            "✓ Document detected and perspective corrected."
          )
        } else {
          setMessage(
            "Document edges were not detected. Original image kept."
          )
        }
      }

      result =
        await applyImageFilters(
          result,
          {
            shadows:
              removeShadows,
            grayscale,
            bw: blackWhite,
          }
        )

      const updatedPages =
        [...pages]

      updatedPages[
        selectedPage
      ] = {
        ...page,
        processed: result,
      }

      setPages(updatedPages)
      setPreview(result)
    } catch (error) {
      setMessage(
        "Something went wrong while scanning."
      )
    }

    setScanning(false)
  }

  const addPage = () => {
    fileInputRef.current?.click()
  }

  const handleAdditionalPage = (
    selectedFile
  ) => {
    if (
      !selectedFile ||
      !selectedFile.type.startsWith(
        "image/"
      )
    ) {
      return
    }

    const reader =
      new FileReader()

    reader.onload = () => {
      const result = reader.result

      const newPage = {
        id: Date.now(),
        original: result,
        processed: result,
        name: selectedFile.name,
        size: selectedFile.size,
      }

      setPages((prev) => [
        ...prev,
        newPage,
      ])

      setSelectedPage(
        pages.length
      )
    }

    reader.readAsDataURL(
      selectedFile
    )
  }

  const selectPage = (index) => {
    setSelectedPage(index)
    setPreview(
      pages[index].processed
    )
  }

  const deletePage = () => {
    if (pages.length === 0) return

    const updated =
      pages.filter(
        (_, index) =>
          index !== selectedPage
      )

    setPages(updated)

    const newIndex = Math.max(
      0,
      selectedPage - 1
    )

    setSelectedPage(newIndex)

    if (updated.length) {
      setPreview(
        updated[newIndex].processed
      )
    } else {
      setPreview(null)
    }
  }

  const rotatePage = async () => {
    if (!pages.length) return

    const page =
      pages[selectedPage]

    const img =
      await loadImage(
        page.processed
      )

    const canvas =
      document.createElement(
        "canvas"
      )

    canvas.width =
      img.naturalHeight

    canvas.height =
      img.naturalWidth

    const ctx =
      canvas.getContext("2d")

    ctx.translate(
      canvas.width / 2,
      canvas.height / 2
    )

    ctx.rotate(
      Math.PI / 2
    )

    ctx.drawImage(
      img,
      -img.naturalWidth / 2,
      -img.naturalHeight / 2
    )

    const result =
      canvas.toDataURL(
        "image/jpeg",
        0.95
      )

    const updated =
      [...pages]

    updated[selectedPage] = {
      ...page,
      processed: result,
    }

    setPages(updated)
    setPreview(result)
  }

  const exportScan = async () => {
    if (!pages.length) return

    setMessage("Preparing export...")

    try {
      if (format === "PDF") {
        const pdf =
          await PDFDocument.create()

        for (const page of pages) {
          const imageURL =
            page.processed

          const imageBytes =
            await fetch(
              imageURL
            ).then((r) =>
              r.arrayBuffer()
            )

          let embedded

          if (
            imageURL.includes(
              "image/png"
            )
          ) {
            embedded =
              await pdf.embedPng(
                imageBytes
              )
          } else {
            embedded =
              await pdf.embedJpg(
                imageBytes
              )
          }

          const scale =
            Math.min(
              595 / embedded.width,
              842 / embedded.height
            )

          const pagePDF =
            pdf.addPage([
              embedded.width * scale,
              embedded.height * scale,
            ])

          pagePDF.drawImage(
            embedded,
            {
              x: 0,
              y: 0,
              width:
                embedded.width *
                scale,
              height:
                embedded.height *
                scale,
            }
          )
        }

        const bytes =
          await pdf.save()

        const blob =
          new Blob(
            [bytes],
            {
              type: "application/pdf",
            }
          )

        downloadBlob(
          blob,
          "fileflow-scan.pdf"
        )
      } else {
        const quality =
          compression === "Best"
            ? 0.95
            : compression ===
              "Smallest"
            ? 0.55
            : 0.78

        const mime =
          format === "PNG"
            ? "image/png"
            : "image/jpeg"

        const dataURL =
          await imageToDataURL(
            pages[0].processed,
            mime,
            quality
          )

        const blob =
          await dataURLToBlob(
            dataURL
          )

        downloadBlob(
          blob,
          `fileflow-scan.${format.toLowerCase()}`
        )
      }

      setMessage(
        "✓ Scan exported successfully."
      )
    } catch (error) {
      setMessage(
        "Export failed."
      )
    }
  }

  return (
    <ToolLayout
      title="Smart Scan"
      description="Turn photos into clean, professional document scans."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">

        <div className="space-y-6">

          {!cameraOpen &&
            pages.length === 0 && (
              <Panel>
                <div className="rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-10 text-center">

                  <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container text-2xl text-primary">
                    ▣
                  </div>

                  <h2 className="text-xl font-bold text-primary-heading">
                    Scan a document
                  </h2>

                  <p className="mx-auto mt-2 max-w-md text-sm text-on-surface-variant">
                    Capture a document using your
                    camera or select an existing image.
                  </p>

                  <div className="mt-7 flex flex-wrap justify-center gap-3">

                    <button
                      onClick={startCamera}
                      className="rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white"
                    >
                      📷 Scan with Camera
                    </button>

                    <button
                      onClick={() =>
                        fileInputRef.current?.click()
                      }
                      className="rounded-lg border border-outline px-5 py-3 text-sm font-bold text-primary"
                    >
                      Select Image
                    </button>

                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleInput}
                  />
                </div>
              </Panel>
            )}

          {cameraOpen && (
            <Panel title="Camera Scanner">

              <div className="overflow-hidden rounded-xl bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="max-h-[600px] w-full object-contain"
                />
              </div>

              <div className="mt-4 flex gap-3">

                <button
                  onClick={capturePhoto}
                  className="flex-1 rounded-lg bg-primary px-5 py-3 font-bold text-white"
                >
                  ● Capture Document
                </button>

                <button
                  onClick={stopCamera}
                  className="rounded-lg border border-outline px-5 py-3 font-bold text-primary"
                >
                  Cancel
                </button>

              </div>

            </Panel>
          )}

          {pages.length > 0 && (
            <>
              <Panel title="Selected File">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">

                  <img
                    src={pages[selectedPage]?.processed}
                    className="h-24 w-24 rounded-lg border border-outline-variant object-cover"
                  />

                  <div className="flex-1">
                    <p className="font-bold text-primary-heading">
                      {pages[selectedPage]?.name}
                    </p>

                    <p className="mt-1 text-sm text-on-surface-variant">
                      {formatBytes(
                        pages[selectedPage]?.size
                      )}
                    </p>

                    <div className="mt-2 text-xs font-bold text-primary">
                      ✓ Ready to scan
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    className="rounded-lg border border-outline px-4 py-2 text-sm font-bold text-primary"
                  >
                    Change
                  </button>

                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    if (pages.length > 0) {
                      handleAdditionalPage(
                        e.target.files?.[0]
                      )
                    }
                  }}
                />

              </Panel>

              <Panel title="Preview">

                <div className="flex min-h-[500px] items-center justify-center rounded-xl bg-surface-container p-4">

                  {preview && (
                    <img
                      src={preview}
                      className="max-h-[650px] max-w-full rounded-lg object-contain shadow-sm"
                    />
                  )}

                </div>

                <div className="mt-4 flex flex-wrap gap-2">

                  <button
                    onClick={rotatePage}
                    className="rounded-lg border border-outline px-4 py-2 text-sm font-bold"
                  >
                    ↻ Rotate
                  </button>

                  <button
                    onClick={addPage}
                    className="rounded-lg border border-outline px-4 py-2 text-sm font-bold"
                  >
                    + Add Page
                  </button>

                  <button
                    onClick={deletePage}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700"
                  >
                    Delete Page
                  </button>

                </div>

              </Panel>

              <Panel title={`Pages (${pages.length})`}>

                <div className="flex flex-wrap gap-3">

                  {pages.map((page, index) => (
                    <button
                      key={page.id}
                      onClick={() =>
                        selectPage(index)
                      }
                      className={`relative overflow-hidden rounded-lg border-2 ${
                        selectedPage === index
                          ? "border-primary"
                          : "border-outline-variant"
                      }`}
                    >
                      <img
                        src={page.processed}
                        className="h-24 w-20 object-cover"
                      />

                      <span className="absolute bottom-0 left-0 right-0 bg-primary/80 py-1 text-center text-xs font-bold text-white">
                        {index + 1}
                      </span>
                    </button>
                  ))}

                  <button
                    onClick={addPage}
                    className="flex h-24 w-20 items-center justify-center rounded-lg border-2 border-dashed border-outline-variant text-2xl text-primary"
                  >
                    +
                  </button>

                </div>

              </Panel>
            </>
          )}

        </div>

        <div className="space-y-6">

          <Panel title="Enhancements">

            <div className="space-y-4">

              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-primary-heading">
                    Auto-Detect Edges
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Find the document boundary automatically.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) =>
                    setAutoDetect(
                      e.target.checked
                    )
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-primary-heading">
                    Perspective Fix
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Straighten tilted documents.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={perspectiveFix}
                  onChange={(e) =>
                    setPerspectiveFix(
                      e.target.checked
                    )
                  }
                  className="h-5 w-5"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-primary-heading">
                    Remove Shadows
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    Brighten darker areas.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={removeShadows}
                  onChange={(e) =>
                    setRemoveShadows(
                      e.target.checked
                    )
                  }
                  className="h-5 w-5"
                />
              </label>

              <div>
                <p className="mb-2 font-semibold text-primary-heading">
                  Color Mode
                </p>

                <div className="grid grid-cols-3 gap-2">

                  <button
                    onClick={() => {
                      setGrayscale(false)
                      setBlackWhite(false)
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      !grayscale &&
                      !blackWhite
                        ? "border-primary bg-primary text-white"
                        : "border-outline"
                    }`}
                  >
                    Color
                  </button>

                  <button
                    onClick={() => {
                      setGrayscale(true)
                      setBlackWhite(false)
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      grayscale
                        ? "border-primary bg-primary text-white"
                        : "border-outline"
                    }`}
                  >
                    Gray
                  </button>

                  <button
                    onClick={() => {
                      setGrayscale(false)
                      setBlackWhite(true)
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                      blackWhite
                        ? "border-primary bg-primary text-white"
                        : "border-outline"
                    }`}
                  >
                    B&W
                  </button>

                </div>
              </div>

            </div>

          </Panel>

          <Panel title="Output Settings">

            <div className="space-y-5">

              <div>
                <p className="mb-2 text-sm font-bold text-primary-heading">
                  Format
                </p>

                <div className="grid grid-cols-3 gap-2">

                  {["PDF", "JPG", "PNG"].map(
                    (item) => (
                      <button
                        key={item}
                        onClick={() =>
                          setFormat(item)
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-bold ${
                          format === item
                            ? "border-primary bg-primary text-white"
                            : "border-outline"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold text-primary-heading">
                  Compression
                </p>

                <div className="space-y-2">

                  {[
                    "Best",
                    "Balanced",
                    "Smallest",
                  ].map((item) => (
                    <button
                      key={item}
                      onClick={() =>
                        setCompression(item)
                      }
                      className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-semibold ${
                        compression === item
                          ? "border-primary bg-secondary-container"
                          : "border-outline"
                      }`}
                    >
                      {item}
                    </button>
                  ))}

                </div>
              </div>

              <button
                disabled={
                  !pages.length ||
                  scanning
                }
                onClick={scanDocument}
                className="w-full rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {scanning
                  ? "Scanning..."
                  : "Scan Document →"}
              </button>

              <button
                disabled={
                  !pages.length ||
                  scanning
                }
                onClick={exportScan}
                className="w-full rounded-lg border border-primary px-5 py-3 font-bold text-primary disabled:opacity-50"
              >
                Scan & Export
              </button>

            </div>

          </Panel>

          {message && (
            <div className="rounded-xl border border-outline-variant bg-surface p-4 text-sm font-medium text-primary">
              {message}
            </div>
          )}

          <div className="rounded-xl bg-secondary-container p-4">
            <p className="text-sm font-bold text-primary">
              🔒 Your files stay on your device
            </p>

            <p className="mt-1 text-xs leading-5 text-on-surface-variant">
              FileFlow processes your scan locally in
              your browser. Nothing is uploaded to a server.
            </p>
          </div>

        </div>

      </div>
    </ToolLayout>
  )
}

const Convert = () => {
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [format, setFormat] = useState("PNG")
  const [quality, setQuality] = useState(0.85)

  const selectFile = (e) => {
    const selected = e.target.files?.[0]

    if (!selected) return

    if (!selected.type.startsWith("image/")) {
      return
    }

    setFile(selected)

    const reader = new FileReader()

    reader.onload = () =>
      setPreview(reader.result)

    reader.readAsDataURL(selected)
  }

  const convert = async () => {
    if (!preview) return

    const mime =
      format === "PNG"
        ? "image/png"
        : format === "WEBP"
        ? "image/webp"
        : "image/jpeg"

    const dataURL =
      await imageToDataURL(
        preview,
        mime,
        quality
      )

    const blob =
      await dataURLToBlob(dataURL)

    downloadBlob(
      blob,
      `converted.${format.toLowerCase()}`
    )
  }

  return (
    <ToolLayout
      title="Convert"
      description="Convert images between common file formats."
    >
      <div className="grid gap-6 lg:grid-cols-2">

        <Panel title="Select File">

          <button
            onClick={() =>
              inputRef.current?.click()
            }
            className="w-full rounded-xl border-2 border-dashed border-outline-variant p-10 text-center"
          >
            <div className="text-3xl">⇄</div>

            <p className="mt-3 font-bold text-primary-heading">
              Select an image
            </p>

            <p className="mt-1 text-sm text-on-surface-variant">
              JPG, PNG or WebP
            </p>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={selectFile}
          />

          {file && (
            <div className="mt-5 rounded-lg bg-surface-container p-4">
              <p className="font-bold">
                {file.name}
              </p>

              <p className="text-sm text-on-surface-variant">
                {formatBytes(file.size)}
              </p>
            </div>
          )}

        </Panel>

        <Panel title="Conversion Settings">

          {preview && (
            <img
              src={preview}
              className="mb-5 max-h-72 w-full rounded-lg object-contain bg-surface-container"
            />
          )}

          <div className="mb-5">
            <p className="mb-2 text-sm font-bold">
              Output Format
            </p>

            <div className="grid grid-cols-3 gap-2">

              {["PNG", "JPG", "WEBP"].map(
                (item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setFormat(item)
                    }
                    className={`rounded-lg border px-3 py-2 font-bold ${
                      format === item
                        ? "border-primary bg-primary text-white"
                        : "border-outline"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

            </div>
          </div>

          <label className="block">
            <span className="text-sm font-bold">
              Quality
            </span>

            <input
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              value={quality}
              onChange={(e) =>
                setQuality(
                  Number(e.target.value)
                )
              }
              className="mt-3 w-full"
            />
          </label>

          <button
            onClick={convert}
            disabled={!preview}
            className="mt-6 w-full rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Convert & Download
          </button>

        </Panel>

      </div>
    </ToolLayout>
  )
}

const Compress = () => {
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [level, setLevel] =
    useState("Balanced")
  const [resultSize, setResultSize] =
    useState(null)

  const selectFile = (e) => {
    const selected = e.target.files?.[0]

    if (!selected) return

    if (!selected.type.startsWith("image/")) {
      return
    }

    setFile(selected)

    const reader = new FileReader()

    reader.onload = () =>
      setPreview(reader.result)

    reader.readAsDataURL(selected)
  }

  const compress = async () => {
    if (!preview || !file) return

    const quality =
      level === "High Quality"
        ? 0.9
        : level === "Maximum Reduction"
        ? 0.4
        : 0.7

    const dataURL =
      await imageToDataURL(
        preview,
        "image/jpeg",
        quality
      )

    const blob =
      await dataURLToBlob(dataURL)

    setResultSize(blob.size)

    downloadBlob(
      blob,
      "fileflow-compressed.jpg"
    )
  }

  return (
    <ToolLayout
      title="Smart Compress"
      description="Reduce file size while keeping important visual quality."
    >
      <div className="grid gap-6 lg:grid-cols-2">

        <Panel title="Select File">

          <button
            onClick={() =>
              inputRef.current?.click()
            }
            className="w-full rounded-xl border-2 border-dashed border-outline-variant p-10"
          >
            <div className="text-3xl">
              ↓
            </div>

            <p className="mt-3 font-bold">
              Select image
            </p>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={selectFile}
          />

          {file && (
            <div className="mt-4 rounded-lg bg-surface-container p-4">
              <p className="font-bold">
                {file.name}
              </p>

              <p className="text-sm">
                Original:{" "}
                {formatBytes(file.size)}
              </p>

              {resultSize && (
                <p className="mt-1 text-sm font-bold text-primary">
                  Result:{" "}
                  {formatBytes(resultSize)}
                </p>
              )}
            </div>
          )}

        </Panel>

        <Panel title="Compression">

          {preview && (
            <img
              src={preview}
              className="mb-5 max-h-72 w-full rounded-lg object-contain bg-surface-container"
            />
          )}

          <div className="space-y-2">

            {[
              "High Quality",
              "Balanced",
              "Maximum Reduction",
            ].map((item) => (
              <button
                key={item}
                onClick={() =>
                  setLevel(item)
                }
                className={`w-full rounded-lg border p-3 text-left font-bold ${
                  level === item
                    ? "border-primary bg-secondary-container"
                    : "border-outline"
                }`}
              >
                {item}
              </button>
            ))}

          </div>

          <button
            onClick={compress}
            disabled={!file}
            className="mt-5 w-full rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Compress & Download
          </button>

        </Panel>

      </div>
    </ToolLayout>
  )
}

const Resize = () => {
  const inputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [keepRatio, setKeepRatio] =
    useState(true)

  const selectFile = (e) => {
    const selected = e.target.files?.[0]

    if (!selected) return

    if (!selected.type.startsWith("image/")) {
      return
    }

    setFile(selected)

    const reader = new FileReader()

    reader.onload = () => {
      setPreview(reader.result)
    }

    reader.readAsDataURL(selected)
  }

  const resize = async () => {
    if (!preview || !width) return

    const img =
      await loadImage(preview)

    const newWidth =
      Number(width)

    let newHeight =
      Number(height)

    if (keepRatio) {
      newHeight =
        Math.round(
          (img.naturalHeight /
            img.naturalWidth) *
            newWidth
        )
    }

    if (!newHeight) return

    const canvas =
      document.createElement(
        "canvas"
      )

    canvas.width = newWidth
    canvas.height = newHeight

    const ctx =
      canvas.getContext("2d")

    ctx.drawImage(
      img,
      0,
      0,
      newWidth,
      newHeight
    )

    const dataURL =
      canvas.toDataURL(
        "image/jpeg",
        0.85
      )

    const blob =
      await dataURLToBlob(dataURL)

    downloadBlob(
      blob,
      "fileflow-resized.jpg"
    )
  }

  return (
    <ToolLayout
      title="Resize"
      description="Resize images using custom dimensions."
    >
      <div className="grid gap-6 lg:grid-cols-2">

        <Panel title="Image">

          <button
            onClick={() =>
              inputRef.current?.click()
            }
            className="w-full rounded-xl border-2 border-dashed border-outline-variant p-10"
          >
            Select Image
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={selectFile}
          />

          {preview && (
            <img
              src={preview}
              className="mt-5 max-h-80 w-full rounded-lg object-contain bg-surface-container"
            />
          )}

        </Panel>

        <Panel title="Resize Settings">

          <div className="grid grid-cols-2 gap-4">

            <label>
              <span className="text-sm font-bold">
                Width
              </span>

              <input
                type="number"
                value={width}
                onChange={(e) =>
                  setWidth(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-outline bg-background px-3 py-3"
                placeholder="1200"
              />
            </label>

            <label>
              <span className="text-sm font-bold">
                Height
              </span>

              <input
                type="number"
                value={height}
                onChange={(e) =>
                  setHeight(e.target.value)
                }
                className="mt-2 w-full rounded-lg border border-outline bg-background px-3 py-3"
                placeholder="800"
              />
            </label>

          </div>

          <label className="mt-5 flex items-center gap-3">
            <input
              type="checkbox"
              checked={keepRatio}
              onChange={(e) =>
                setKeepRatio(
                  e.target.checked
                )
              }
              className="h-5 w-5"
            />

            <span className="font-semibold">
              Maintain aspect ratio
            </span>
          </label>

          <button
            onClick={resize}
            disabled={!preview}
            className="mt-6 w-full rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Resize & Download
          </button>

        </Panel>

      </div>
    </ToolLayout>
  )
}

const PDFTools = () => {
  const [files, setFiles] =
    useState([])

  const inputRef = useRef(null)

  const selectFiles = (e) => {
    const selected =
      Array.from(
        e.target.files || []
      )

    setFiles(selected)
  }

  const mergePDFs = async () => {
    if (!files.length) return

    const merged =
      await PDFDocument.create()

    for (const file of files) {
      const bytes =
        await file.arrayBuffer()

      const pdf =
        await PDFDocument.load(bytes)

      const copiedPages =
        await merged.copyPages(
          pdf,
          pdf.getPageIndices()
        )

      copiedPages.forEach(
        (page) =>
          merged.addPage(page)
      )
    }

    const bytes =
      await merged.save()

    downloadBlob(
      new Blob(
        [bytes],
        {
          type: "application/pdf",
        }
      ),
      "fileflow-merged.pdf"
    )
  }

  const splitPDF = async () => {
    if (files.length !== 1) return

    const bytes =
      await files[0].arrayBuffer()

    const pdf =
      await PDFDocument.load(bytes)

    for (
      let i = 0;
      i < pdf.getPageCount();
      i++
    ) {
      const newPDF =
        await PDFDocument.create()

      const [page] =
        await newPDF.copyPages(
          pdf,
          [i]
        )

      newPDF.addPage(page)

      const pageBytes =
        await newPDF.save()

      downloadBlob(
        new Blob(
          [pageBytes],
          {
            type: "application/pdf",
          }
        ),
        `page-${i + 1}.pdf`
      )
    }
  }

  return (
    <ToolLayout
      title="PDF Tools"
      description="Merge and split PDF documents locally."
    >
      <div className="grid gap-6 lg:grid-cols-2">

        <Panel title="Select PDFs">

          <button
            onClick={() =>
              inputRef.current?.click()
            }
            className="w-full rounded-xl border-2 border-dashed border-outline-variant p-10 text-center"
          >
            <div className="text-3xl">
              ▤
            </div>

            <p className="mt-3 font-bold">
              Select PDF files
            </p>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={selectFiles}
          />

          {files.length > 0 && (
            <div className="mt-5 space-y-2">

              {files.map(
                (file, index) => (
                  <div
                    key={index}
                    className="rounded-lg bg-surface-container p-3"
                  >
                    <p className="font-semibold">
                      {file.name}
                    </p>

                    <p className="text-xs text-on-surface-variant">
                      {formatBytes(
                        file.size
                      )}
                    </p>
                  </div>
                )
              )}

            </div>
          )}

        </Panel>

        <Panel title="PDF Actions">

          <button
            onClick={mergePDFs}
            disabled={files.length < 2}
            className="mb-3 w-full rounded-lg bg-primary px-5 py-3 font-bold text-white disabled:opacity-50"
          >
            Merge PDFs
          </button>

          <button
            onClick={splitPDF}
            disabled={files.length !== 1}
            className="w-full rounded-lg border border-primary px-5 py-3 font-bold text-primary disabled:opacity-50"
          >
            Split PDF into Pages
          </button>

          <p className="mt-5 text-xs leading-5 text-on-surface-variant">
            PDF processing happens directly in your
            browser. Your documents are not uploaded.
          </p>

        </Panel>

      </div>
    </ToolLayout>
  )
}

export default function App() {
  const [page, setPage] =
    useState("dashboard")

  return (
    <div className="min-h-screen bg-background text-on-surface">

      <Header
        page={page}
        setPage={setPage}
      />

      {page === "dashboard" && (
        <Dashboard
          setPage={setPage}
        />
      )}

      {page === "scan" && (
        <SmartScanPage />
      )}

      {page === "convert" && (
        <Convert />
      )}

      {page === "compress" && (
        <Compress />
      )}

      {page === "resize" && (
        <Resize />
      )}

      {page === "pdf" && (
        <PDFTools />
      )}

    </div>
  )
}