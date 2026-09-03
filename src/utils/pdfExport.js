import { PDFDocument, degrees } from "pdf-lib"

export async function imagesToPDF(images, filename = "fileflow-scan.pdf") {
  const pdfDoc = await PDFDocument.create()

  for (const image of images) {
    let imageBytes

    if (typeof image === "string") {
      const response = await fetch(image)
      imageBytes = await response.arrayBuffer()
    } else if (image instanceof Blob) {
      imageBytes = await image.arrayBuffer()
    } else {
      imageBytes = image
    }

    let pdfImage

    const bytes = new Uint8Array(imageBytes)

    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      pdfImage = await pdfDoc.embedPng(bytes)
    } else {
      pdfImage = await pdfDoc.embedJpg(bytes)
    }

    const width = pdfImage.width
    const height = pdfImage.height

    const page = pdfDoc.addPage([width, height])

    page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width,
      height,
    })
  }

  const pdfBytes = await pdfDoc.save()

  return new Blob([pdfBytes], {
    type: "application/pdf",
  })
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}