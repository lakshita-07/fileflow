import { useState } from "react"
import FileUpload from "../components/FileUpload"
import {
  mergePDFs,
  extractPDFPages,
  rotatePDF
} from "../utils/pdfExport"

export default function PDFTools() {
  const [files, setFiles] =
    useState([])

  const [mode, setMode] =
    useState("merge")

  const [pages, setPages] =
    useState("1")

  const [message, setMessage] =
    useState("")

  async function run() {
    if (!files.length) {
      setMessage(
        "Select PDF files first."
      )
      return
    }

    try {
      if (mode === "merge") {
        await mergePDFs(
          files,
          "FileFlow_Merged.pdf"
        )
      }

      if (mode === "extract") {
        await extractPDFPages(
          files[0],
          pages
            .split(",")
            .map(Number),
          "FileFlow_Extracted.pdf"
        )
      }

      if (mode === "rotate") {
        await rotatePDF(
          files[0],
          90,
          "FileFlow_Rotated.pdf"
        )
      }

      setMessage(
        "PDF operation completed."
      )
    } catch (error) {
      console.error(error)

      setMessage(
        "PDF operation failed."
      )
    }
  }

  return (
    <main className="mx-auto max-w-[1000px] px-5 py-10">

      <h1 className="text-4xl font-bold text-[#31473a]">
        PDF Tools
      </h1>

      <p className="mt-2 text-[#424844]">
        Merge, extract and rotate PDF files.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-2">

        {[
          ["merge", "Merge"],
          ["extract", "Extract"],
          ["rotate", "Rotate"]
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() =>
              setMode(value)
            }
            className={
              mode === value
                ? "rounded-lg bg-[#1b3125] p-3 font-bold text-white"
                : "rounded-lg border p-3 font-bold"
            }
          >
            {label}
          </button>
        ))}

      </div>

      <div className="mt-5">

        <FileUpload
          accept="application/pdf"
          multiple={mode === "merge"}
          onFiles={setFiles}
          title={
            mode === "merge"
              ? "Select PDFs"
              : "Select PDF"
          }
        />

      </div>

      {files.length > 0 && (
        <div className="mt-5 rounded-xl border bg-[#edf4f2] p-5">

          <h2 className="font-bold">
            Selected Files
          </h2>

          <div className="mt-3 space-y-2">

            {files.map(
              (file, index) => (
                <div
                  key={index}
                  className="rounded-lg bg-white p-3"
                >
                  {file.name}
                </div>
              )
            )}

          </div>

        </div>
      )}

      {mode === "extract" && (
        <input
          value={pages}
          onChange={event =>
            setPages(
              event.target.value
            )
          }
          placeholder="Pages: 1,2,3"
          className="mt-5 w-full rounded-lg border p-3"
        />
      )}

      <button
        onClick={run}
        className="mt-5 w-full rounded-lg bg-[#1b3125] p-4 font-bold text-white"
      >
        Run PDF Tool →
      </button>

      {message && (
        <p className="mt-4 font-semibold">
          {message}
        </p>
      )}

    </main>
  )
}