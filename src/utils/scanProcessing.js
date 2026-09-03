import cv from "@techstark/opencv-js"

let cvPromise = null

function getCV() {
  if (!cvPromise) {
    if (cv instanceof Promise) {
      cvPromise = cv
    } else {
      cvPromise = Promise.resolve(cv)
    }
  }

  return cvPromise
}

function imageToCanvas(image) {
  const canvas = document.createElement("canvas")

  canvas.width =
    image.naturalWidth ||
    image.videoWidth ||
    image.width

  canvas.height =
    image.naturalHeight ||
    image.videoHeight ||
    image.height

  const ctx = canvas.getContext("2d")

  ctx.drawImage(image, 0, 0)

  return canvas
}

function canvasToDataURL(canvas, quality = 0.92) {
  return canvas.toDataURL(
    "image/jpeg",
    quality
  )
}

export async function detectDocumentCorners(image) {
  try {
    const cvLib = await getCV()

    const canvas = imageToCanvas(image)

    const src = cvLib.imread(canvas)

    const gray = new cvLib.Mat()
    const blurred = new cvLib.Mat()
    const edges = new cvLib.Mat()

    cvLib.cvtColor(
      src,
      gray,
      cvLib.COLOR_RGBA2GRAY
    )

    cvLib.GaussianBlur(
      gray,
      blurred,
      new cvLib.Size(5, 5),
      0
    )

    cvLib.Canny(
      blurred,
      edges,
      50,
      150
    )

    const contours = new cvLib.MatVector()
    const hierarchy = new cvLib.Mat()

    cvLib.findContours(
      edges,
      contours,
      hierarchy,
      cvLib.RETR_LIST,
      cvLib.CHAIN_APPROX_SIMPLE
    )

    let bestContour = null
    let bestArea = 0

    const imageArea =
      src.cols * src.rows

    for (
      let i = 0;
      i < contours.size();
      i++
    ) {
      const contour = contours.get(i)

      const area = cvLib.contourArea(
        contour
      )

      if (area < imageArea * 0.15) {
        contour.delete()
        continue
      }

      const perimeter =
        cvLib.arcLength(
          contour,
          true
        )

      const approx = new cvLib.Mat()

      cvLib.approxPolyDP(
        contour,
        approx,
        0.02 * perimeter,
        true
      )

      if (
        approx.rows === 4 &&
        area > bestArea
      ) {
        if (bestContour) {
          bestContour.delete()
        }

        bestContour = approx
        bestArea = area
      } else {
        approx.delete()
      }

      contour.delete()
    }

    let result = null

    if (bestContour) {
      const points = []

      for (
        let i = 0;
        i < 4;
        i++
      ) {
        points.push({
          x:
            (bestContour.data32S[i * 2] /
              src.cols) *
            100,

          y:
            (bestContour.data32S[i * 2 + 1] /
              src.rows) *
            100
        })
      }

      result = orderCorners(points)

      bestContour.delete()
    }

    src.delete()
    gray.delete()
    blurred.delete()
    edges.delete()
    contours.delete()
    hierarchy.delete()

    return result
  } catch (error) {
    console.error(
      "Document detection error:",
      error
    )

    return null
  }
}

function orderCorners(points) {
  const sums = points.map(
    p => p.x + p.y
  )

  const diffs = points.map(
    p => p.x - p.y
  )

  const topLeft =
    points[sums.indexOf(Math.min(...sums))]

  const bottomRight =
    points[sums.indexOf(Math.max(...sums))]

  const topRight =
    points[diffs.indexOf(Math.max(...diffs))]

  const bottomLeft =
    points[diffs.indexOf(Math.min(...diffs))]

  return [
    topLeft,
    topRight,
    bottomRight,
    bottomLeft
  ]
}

export async function perspectiveCorrect(
  image,
  corners
) {
  try {
    const cvLib = await getCV()

    const canvas = imageToCanvas(image)

    const src = cvLib.imread(canvas)

    const width = src.cols
    const height = src.rows

    const srcPoints = cvLib.matFromArray(
      4,
      1,
      cvLib.CV_32FC2,
      [
        (corners[0].x / 100) * width,
        (corners[0].y / 100) * height,

        (corners[1].x / 100) * width,
        (corners[1].y / 100) * height,

        (corners[2].x / 100) * width,
        (corners[2].y / 100) * height,

        (corners[3].x / 100) * width,
        (corners[3].y / 100) * height
      ]
    )

    const distances = [
      distance(corners[0], corners[1]),
      distance(corners[1], corners[2]),
      distance(corners[2], corners[3]),
      distance(corners[3], corners[0])
    ]

    const targetWidth = Math.round(
      Math.max(
        distances[0],
        distances[2]
      ) * width / 100
    )

    const targetHeight = Math.round(
      Math.max(
        distances[1],
        distances[3]
      ) * height / 100
    )

    const outputWidth = Math.max(
      500,
      Math.min(2500, targetWidth)
    )

    const outputHeight = Math.max(
      500,
      Math.min(3500, targetHeight)
    )

    const dstPoints = cvLib.matFromArray(
      4,
      1,
      cvLib.CV_32FC2,
      [
        0,
        0,

        outputWidth,
        0,

        outputWidth,
        outputHeight,

        0,
        outputHeight
      ]
    )

    const matrix =
      cvLib.getPerspectiveTransform(
        srcPoints,
        dstPoints
      )

    const dst = new cvLib.Mat()

    cvLib.warpPerspective(
      src,
      dst,
      matrix,
      new cvLib.Size(
        outputWidth,
        outputHeight
      )
    )

    const outputCanvas =
      document.createElement("canvas")

    outputCanvas.width = dst.cols
    outputCanvas.height = dst.rows

    cvLib.imshow(
      outputCanvas,
      dst
    )

    const result =
      await loadCanvasImage(
        outputCanvas
      )

    src.delete()
    srcPoints.delete()
    dstPoints.delete()
    matrix.delete()
    dst.delete()

    return result
  } catch (error) {
    console.error(
      "Perspective correction error:",
      error
    )

    return image
  }
}

function distance(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y

  return Math.sqrt(
    dx * dx + dy * dy
  )
}

function loadCanvasImage(canvas) {
  return new Promise(resolve => {
    const img = new Image()

    img.onload = () => resolve(img)

    img.src =
      canvas.toDataURL(
        "image/jpeg",
        0.95
      )
  })
}

export async function applyFilters(
  image,
  filter,
  removeShadows = false
) {
  const cvLib = await getCV()

  const canvas = imageToCanvas(image)

  const src = cvLib.imread(canvas)

  const dst = new cvLib.Mat()

  if (filter === "original") {
    cvLib.cvtColor(
      src,
      dst,
      cvLib.COLOR_RGBA2RGB
    )
  }

  else if (
    filter === "gray"
  ) {
    cvLib.cvtColor(
      src,
      dst,
      cvLib.COLOR_RGBA2GRAY
    )
  }

  else if (
    filter === "bw"
  ) {
    const gray =
      new cvLib.Mat()

    cvLib.cvtColor(
      src,
      gray,
      cvLib.COLOR_RGBA2GRAY
    )

    cvLib.threshold(
      gray,
      dst,
      0,
      255,
      cvLib.THRESH_BINARY +
        cvLib.THRESH_OTSU
    )

    gray.delete()
  }

  else if (
    filter === "contrast"
  ) {
    const gray =
      new cvLib.Mat()

    cvLib.cvtColor(
      src,
      gray,
      cvLib.COLOR_RGBA2GRAY
    )

    cvLib.equalizeHist(
      gray,
      dst
    )

    gray.delete()
  }

  else if (
    filter === "document"
  ) {
    const gray =
      new cvLib.Mat()

    cvLib.cvtColor(
      src,
      gray,
      cvLib.COLOR_RGBA2GRAY
    )

    const adaptive =
      new cvLib.Mat()

    cvLib.adaptiveThreshold(
      gray,
      adaptive,
      255,
      cvLib.ADAPTIVE_THRESH_GAUSSIAN_C,
      cvLib.THRESH_BINARY,
      21,
      10
    )

    cvLib.cvtColor(
      adaptive,
      dst,
      cvLib.COLOR_GRAY2RGBA
    )

    gray.delete()
    adaptive.delete()
  }

  else if (
    filter === "soft"
  ) {
    cvLib.GaussianBlur(
      src,
      dst,
      new cvLib.Size(3, 3),
      0
    )
  }

  else if (
    filter === "auto"
  ) {
    const gray =
      new cvLib.Mat()

    cvLib.cvtColor(
      src,
      gray,
      cvLib.COLOR_RGBA2GRAY
    )

    const enhanced =
      new cvLib.Mat()

    cvLib.equalizeHist(
      gray,
      enhanced
    )

    cvLib.cvtColor(
      enhanced,
      dst,
      cvLib.COLOR_GRAY2RGBA
    )

    gray.delete()
    enhanced.delete()
  }

  else {
    src.copyTo(dst)
  }

  if (removeShadows) {
    const working =
      dst.channels() === 1
        ? dst
        : (() => {
            const temp =
              new cvLib.Mat()

            cvLib.cvtColor(
              dst,
              temp,
              cvLib.COLOR_RGBA2GRAY
            )

            return temp
          })()

    const background =
      new cvLib.Mat()

    const kernel =
      cvLib.getStructuringElement(
        cvLib.MORPH_ELLIPSE,
        new cvLib.Size(21, 21)
      )

    cvLib.morphologyEx(
      working,
      background,
      cvLib.MORPH_OPEN,
      kernel
    )

    const normalized =
      new cvLib.Mat()

    cvLib.divide(
      working,
      background,
      normalized,
      255
    )

    normalized.copyTo(dst)

    if (working !== dst) {
      working.delete()
    }

    background.delete()
    kernel.delete()
    normalized.delete()
  }

  const outputCanvas =
    document.createElement("canvas")

  outputCanvas.width =
    dst.cols

  outputCanvas.height =
    dst.rows

  cvLib.imshow(
    outputCanvas,
    dst
  )

  const result =
    await loadCanvasImage(
      outputCanvas
    )

  src.delete()
  dst.delete()

  return result
}

export function rotateImage(
  image,
  angle
) {
  const canvas =
    document.createElement("canvas")

  const width =
    image.naturalWidth ||
    image.width

  const height =
    image.naturalHeight ||
    image.height

  if (
    angle === 90 ||
    angle === 270
  ) {
    canvas.width = height
    canvas.height = width
  } else {
    canvas.width = width
    canvas.height = height
  }

  const ctx =
    canvas.getContext("2d")

  ctx.translate(
    canvas.width / 2,
    canvas.height / 2
  )

  ctx.rotate(
    angle * Math.PI / 180
  )

  ctx.drawImage(
    image,
    -width / 2,
    -height / 2
  )

  const result =
    new Image()

  result.src =
    canvas.toDataURL(
      "image/jpeg",
      0.95
    )

  return result.src
}

export function cropImage(
  image,
  left,
  top,
  right,
  bottom
) {
  const width =
    image.naturalWidth ||
    image.width

  const height =
    image.naturalHeight ||
    image.height

  const x =
    Math.round(width * left)

  const y =
    Math.round(height * top)

  const cropWidth =
    Math.round(
      width * (right - left)
    )

  const cropHeight =
    Math.round(
      height * (bottom - top)
    )

  const canvas =
    document.createElement("canvas")

  canvas.width =
    cropWidth

  canvas.height =
    cropHeight

  const ctx =
    canvas.getContext("2d")

  ctx.drawImage(
    image,
    x,
    y,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  return canvas.toDataURL(
    "image/jpeg",
    0.95
  )
}