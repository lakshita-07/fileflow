import { useState } from "react"
import FileUpload from "../components/FileUpload"
import {
  fileToDataURL
} from "../utils/scanProcessing"
import {
  imagesToPDF,
  downloadBlob
} from "../utils/pdfExport"

export default function Convert() {
  const [file, setFile] =
    useState(null)

  const [preview, setPreview] =
    useState(null)

  const [format, setFormat] =
    useState("png")

  const [message, setMessage] =
    useState("")

  async function selectFile(files) {
    const selected = files[0]

    if (!selected) return

    setFile(selected)

    if (selected.type.startsWith("image/")) {
      setPreview(
        await fileToDataURL(selected)
      )
    }
  }

  async function convert() {
    if (!file) {
      setMessage("Select a file first.")
      return
    }

    try {
      if (
        file.type.startsWith("image/")
      ) {
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

        if (format === "pdf") {
          await imagesToPDF(
            [src],
            file.name
              .replace(/\.[^/.]+$/, "") +
              ".pdf"
          )
        } else {
          const mime =
            format === "jpg"
              ? "image/jpeg"
              : format === "png"
                ? "image/png"
                : "image/webp"

          const data =
            canvas.toDataURL(
              mime,
              0.9
            )

          const response =
            await fetch(data)

          const blob =
            await response.blob()

          downloadBlob(
            blob,
            file.name
              .replace(/\.[^/.]+$/, "") +
              `.${format}`
          )
        }

        setMessage(
          "Conversion completed."
        )
      }
    } catch (error) {
      console.error(error)

      setMessage(
        "Conversion failed."
      )
    }
  }

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-10">

      <h1 className="text-4xl font-bold text-[#31473a]">
        Convert
      </h1>

      <p className="mt-2 text-[#424844]">
        Convert your images to another format.
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

          <section className="rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-6">

            <h2 className="font-bold">
              Selected File
            </h2>

            <p className="mt-3 font-semibold">
              {file.name}
            </p>

            {preview && (
              <img
                src={preview}
                className="mt-5 max-h-[500px] w-full object-contain"
              />
            )}

          </section>

          <section className="rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-6">

            <h2 className="font-bold">
              Output Format
            </h2>

            <div className="mt-4 grid gap-3">

              {["jpg", "png", "webp", "pdf"].map(
                item => (
                  <button
                    key={item}
                    onClick={() =>
                      setFormat(item)
                    }
                    className={
                      format === item
                        ? "rounded-lg bg-[#1b3125] px-4 py-3 font-bold text-white"
                        : "rounded-lg border border-[#737973] px-4 py-3 font-bold"
                    }
                  >
                    {item.toUpperCase()}
                  </button>
                )
              )}

            </div>

            <button
              onClick={convert}
              className="mt-6 w-full rounded-lg bg-[#1b3125] px-4 py-4 font-bold text-white"
            >
              Convert →
            </button>

            {message && (
              <p className="mt-4 font-semibold">
                {message}
              </p>
            )}

          </section>

        </div>
      )}

    </main>
  )
}