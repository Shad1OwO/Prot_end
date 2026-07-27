import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return <div className="page-container grid min-h-[70vh] place-items-center py-16"><div className="max-w-lg text-center"><Compass className="mx-auto text-emerald-700" size={44} /><p className="mt-5 font-bold text-emerald-700">404</p><h1 className="mt-2 text-4xl font-extrabold">This route is off the map</h1><p className="mt-4 text-[var(--muted)]">The page may have moved, or the destination is no longer available.</p><Link href="/en" className="mt-7 inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-5 font-bold text-white">Return home</Link></div></div>;
}
