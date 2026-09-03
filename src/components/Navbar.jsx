import { Link, useLocation } from "react-router-dom"

const links = [
  ["Dashboard", "/dashboard"],
  ["Smart Scan", "/smart-scan"],
  ["Convert", "/convert"],
  ["Compress", "/compress"],
  ["Resize", "/resize"],
  ["PDF Tools", "/pdf-tools"]
]

export default function Navbar() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-50 border-b border-[#c2c8c2] bg-[#f4fbf9]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-4 lg:px-10">

        <Link
          to="/dashboard"
          className="flex items-center gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1b3125] font-bold text-white">
            F
          </div>

          <span className="text-xl font-bold text-[#1b3125]">
            FileFlow
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {links.map(([name, path]) => (
            <Link
              key={path}
              to={path}
              className={
                location.pathname === path
                  ? "font-bold text-[#1b3125]"
                  : "text-[#424844] hover:text-[#1b3125]"
              }
            >
              {name}
            </Link>
          ))}
        </nav>

        <div className="rounded-full border border-[#737973] px-4 py-2 text-sm font-semibold text-[#1b3125]">
          ✓ 100% Private
        </div>

      </div>
    </header>
  )
}