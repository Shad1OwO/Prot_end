import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] p-6 text-center text-[var(--text)]"><div><p className="font-bold text-emerald-700">404</p><h1 className="mt-2 text-4xl font-extrabold">This route is off the map</h1><p className="mt-4 text-[var(--muted)]">The page may have moved.</p><Link href="/en" className="mt-7 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-5 font-bold text-white">Return home</Link></div></main>;
}
