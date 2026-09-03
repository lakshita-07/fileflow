import { useState } from "react"
import FileUpload from "../components/FileUpload"
import {
  fileToDataURL
} from "../utils/scanProcessing"
import {
  downloadBlob
} from "../utils/pdfExport"

export default function SmartCompress() {
  const [file, setFile] =
    useState(null)

  const [preview, setPreview] =
    useState(null)

  const [quality, setQuality] =
    useState("balanced")

  const [target, setTarget] =
    useState("2")

  const [message, setMessage] =
    useState("")

  const selectFile = (e) => {
    const selected = e.target.files?.[0]

  if (!selected) return

  if (!selected.type.startsWith("image/")) {
    return
  }

  setFile(selected)

  const reader = new FileReader()

  reader.onload = async () => {
    const image = await loadImage(reader.result)

    setPreview(reader.result)

    setOriginalWidth(image.naturalWidth)
    setOriginalHeight(image.naturalHeight)

    setWidth(image.naturalWidth)
    setHeight(image.naturalHeight)
  }

  reader.readAsDataURL(selected)
}

  async function compress() {
    if (!file) {
      setMessage(
        "Select a file first."
      )
      return
    }

    if (!file.type.startsWith("image/")) {
      setMessage(
        "Image compression is supported in this browser-only V1."
      )
      return
    }

    const src =
      await fileToDataURL(file)

    const img =
      new Image()

    await new Promise(resolve => {
      img.onload = resolve
      img.src = src
    })

    const canvas =
      document.createElement("canvas")

    canvas.width =
      img.naturalWidth

    canvas.height =
      img.naturalHeight

    const ctx =
      canvas.getContext("2d")

    ctx.drawImage(
      img,
      0,
      0
    )

    let jpegQuality = 0.8

    if (quality === "smallest") {
      jpegQuality = 0.45
    }

    if (quality === "high") {
      jpegQuality = 0.92
    }

    const data =
      canvas.toDataURL(
        "image/jpeg",
        jpegQuality
      )

    const blob =
      await fetch(data).then(
        response =>
          response.blob()
      )

    downloadBlob(
      blob,
      file.name
        .replace(/\.[^/.]+$/, "") +
        "-compressed.jpg"
    )

    setMessage(
      `Compression complete. Target: ${target} MB.`
    )
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-10">

      <h1 className="text-4xl font-bold text-[#31473a]">
        Smart Compress
      </h1>

      <p className="mt-2 text-[#424844]">
        Reduce file size while keeping the result useful.
      </p>

      {!file && (
        <div className="mt-8">
          <FileUpload
            accept="image/*"
            onFiles={selectFile}
            title="Select file to compress"
          />
        </div>
      )}

      {file && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">

          <div className="rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-6">

            <h2 className="font-bold">
              Preview
            </h2>

            {preview && (
              <img
                src={preview}
                className="mt-5 max-h-[500px] w-full object-contain"
              />
            )}

          </div>

          <div className="rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-6">

            <h2 className="font-bold">
              Compression
            </h2>

            <div className="mt-4 grid gap-2">

              <button
                onClick={() =>
                  setQuality("smallest")
                }
                className={
                  quality === "smallest"
                    ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                    : "rounded-lg border p-3 font-bold"
                }
              >
                Maximum Reduction
              </button>

              <button
                onClick={() =>
                  setQuality("balanced")
                }
                className={
                  quality === "balanced"
                    ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                    : "rounded-lg border p-3 font-bold"
                }
              >
                Balanced
              </button>

              <button
                onClick={() =>
                  setQuality("high")
                }
                className={
                  quality === "high"
                    ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                    : "rounded-lg border p-3 font-bold"
                }
              >
                High Quality
              </button>

            </div>

            <label className="mt-5 block">
              <span className="font-semibold">
                Target size
              </span>

              <select
                value={target}
                onChange={event =>
                  setTarget(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border p-3"
              >
                <option value="2">
                  2 MB
                </option>

                <option value="5">
                  5 MB
                </option>

                <option value="custom">
                  Custom
                </option>
              </select>
            </label>

            <button
              onClick={compress}
              className="mt-6 w-full rounded-lg bg-[#1b3125] p-4 font-bold text-white"
            >
              Compress →
            </button>

            {message && (
              <p className="mt-4 font-semibold">
                {message}
              </p>
            )}

          </div>

        </div>
      )}

    </main>
  )
}