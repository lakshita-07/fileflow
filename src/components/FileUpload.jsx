import { useRef } from "react"

export default function FileUpload({
  onFiles,
  accept = "*/*",
  multiple = false,
  title = "Select files"
}) {
  const inputRef = useRef(null)

  function handleChange(event) {
    const files =
      Array.from(event.target.files || [])

    if (files.length) {
      onFiles(files)
    }

    event.target.value = ""
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="cursor-pointer rounded-xl border-2 border-dashed border-[#737973] bg-[#edf4f2] p-10 text-center transition hover:bg-[#e2eae7]"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#dce3be] text-xl">
        ↑
      </div>

      <h3 className="font-bold text-[#1b3125]">
        {title}
      </h3>

      <p className="mt-2 text-sm text-[#424844]">
        Click to choose files
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={handleChange}
      />
    </div>
  )
}