import { Link } from "react-router-dom"

const tools = [
  {
    name: "Smart Scan",
    description:
      "Scan documents with automatic detection, manual corner correction and live enhancement.",
    path: "/smart-scan"
  },
  {
    name: "Convert",
    description:
      "Convert images and PDFs between common formats.",
    path: "/convert"
  },
  {
    name: "Compress",
    description:
      "Reduce file size while preserving useful quality.",
    path: "/compress"
  },
  {
    name: "Resize",
    description:
      "Resize images by dimensions, percentage or target size.",
    path: "/resize"
  },
  {
    name: "PDF Tools",
    description:
      "Merge, split, extract, reorder and rotate PDF pages.",
    path: "/pdf-tools"
  }
]

export default function Dashboard() {
  return (
    <main className="mx-auto max-w-[1280px] px-5 py-12 lg:px-10">

      <section className="mb-12">
        <p className="mb-3 font-semibold text-[#7c8363]">
          ZERO DATA COLLECTION
        </p>

        <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-[#31473a]">
          Professional File Utilities,
          <br />
          Privately in your Browser.
        </h1>

        <p className="mt-5 max-w-2xl text-lg text-[#424844]">
          No uploads, no accounts, 100% local processing.
          Your files stay on your device.
        </p>
      </section>

      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {tools.map(tool => (
          <Link
            key={tool.path}
            to={tool.path}
            className="rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-7 transition hover:-translate-y-1 hover:bg-[#e2eae7]"
          >
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-[#dce3be] text-xl">
              F
            </div>

            <h2 className="text-xl font-bold text-[#1b3125]">
              {tool.name}
            </h2>

            <p className="mt-3 text-[#424844]">
              {tool.description}
            </p>

            <div className="mt-6 font-bold text-[#1b3125]">
              Open tool →
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-8 rounded-xl border border-[#c2c8c2] bg-[#edf4f2] p-7">
        <h2 className="text-xl font-bold text-[#1b3125]">
          Smart Organize
        </h2>

        <p className="mt-2 text-[#424844]">
          Local file analysis and intelligent category suggestions
          are coming next.
        </p>
      </section>

    </main>
  )
}