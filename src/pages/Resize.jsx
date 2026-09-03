import { useState } from "react"
import FileUpload from "../components/FileUpload"
import {
  fileToDataURL,
  resizeImage
} from "../utils/scanProcessing"
import {
  dataURLToBlob
} from "../utils/scanProcessing"
import {
  downloadBlob
} from "pdfExport"

export default function Resize() {
  const [file, setFile] =
    useState(null)

  const [preview, setPreview] =
    useState(null)

  const [width, setWidth] =
    useState(1200)

  const [height, setHeight] =
    useState(1600)
  const [originalWidth, setOriginalWidth] = useState(0)
  const [originalHeight, setOriginalHeight] = useState(0)
  const [percentage, setPercentage] =
    useState(100)

  const [mode, setMode] =
    useState("dimensions")

  const [format, setFormat] =
    useState("jpg")

  async function selectFile(files) {
    const selected = files[0]

    if (!selected) return

    setFile(selected)

    const src =
      await fileToDataURL(selected)

    setPreview(src)
  }

  async function resize() {
    if (!file) return

    const src =
      await fileToDataURL(file)

    const img =
      new Image()

    await new Promise(resolve => {
      img.onload = resolve
      img.src = src
    })

    let newWidth = Number(width)
    let newHeight = Number(height)

    if (mode === "percentage") {
      newWidth =
        Math.round(
          img.naturalWidth *
          percentage /
          100
        )

      newHeight =
        Math.round(
          img.naturalHeight *
          percentage /
          100
        )
    }

    const mime =
      format === "png"
        ? "image/png"
        : format === "webp"
          ? "image/webp"
          : "image/jpeg"

    const result =
      await resizeImage(
        src,
        newWidth,
        newHeight,
        mime,
        0.9
      )

    setPreview(result)

    downloadBlob(
      dataURLToBlob(result),
      file.name
        .replace(/\.[^/.]+$/, "") +
        `-resized.${format}`
    )
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-10">

      <h1 className="text-4xl font-bold text-[#31473a]">
        Resize
      </h1>

      <p className="mt-2 text-[#424844]">
        Resize images by dimensions or percentage.
      </p>

      {!file && (
        <div className="mt-8">
          <FileUpload
            accept="image/*"
            onFiles={selectFile}
            title="Select image"
          />
        </div>
      )}

      {file && (
        <div className="mt-8 grid gap-6 md:grid-cols-2">

          <div className="rounded-xl border bg-[#edf4f2] p-6">
            {preview && (
              <img
                src={preview}
                className="max-h-[550px] w-full object-contain"
              />
            )}
          </div>

          <div className="rounded-xl border bg-[#edf4f2] p-6">

            <div className="grid grid-cols-2 gap-2">

              <button
                onClick={() =>
                  setMode("dimensions")
                }
                className={
                  mode === "dimensions"
                    ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                    : "rounded-lg border p-3 font-bold"
                }
              >
                Dimensions
              </button>

              <button
                onClick={() =>
                  setMode("percentage")
                }
                className={
                  mode === "percentage"
                    ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                    : "rounded-lg border p-3 font-bold"
                }
              >
                Percentage
              </button>

            </div>

            {mode === "dimensions" && (
              <div className="mt-5 grid gap-4">

                <label>
                  Width
                  <input
                    type="number"
                    value={width}
                    onChange={event =>
                      setWidth(
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-lg border p-3"
                  />
                </label>

                <label>
                  Height
                  <input
                    type="number"
                    value={height}
                    onChange={event =>
                      setHeight(
                        event.target.value
                      )
                    }
                    className="mt-2 w-full rounded-lg border p-3"
                  />
                </label>

              </div>
            )}

            {mode === "percentage" && (
              <label className="mt-5 block">
                Percentage
                <input
                  type="number"
                  value={percentage}
                  onChange={event =>
                    setPercentage(
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-lg border p-3"
                />
              </label>
            )}

            <label className="mt-5 block">
              Format

              <select
                value={format}
                onChange={event =>
                  setFormat(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border p-3"
              >
                <option value="jpg">
                  JPG
                </option>

                <option value="png">
                  PNG
                </option>

                <option value="webp">
                  WebP
                </option>
              </select>
            </label>

            <button
              onClick={resize}
              className="mt-6 w-full rounded-lg bg-[#1b3125] p-4 font-bold text-white"
            >
              Resize & Download →
            </button>

          </div>

        </div>
      )}

    </main>
  )
}