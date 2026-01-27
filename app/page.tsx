import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100/70 px-6">
      <div className="w-full max-w-3xl rounded-[32px] border border-neutral-200 bg-white/80 p-10 text-neutral-900 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-400">
          PolyGraph
        </p>
        <h1 className="mt-4 text-4xl font-semibold leading-tight">
          Standalone PolyGraph editor and verifier
        </h1>
        <p className="mt-4 text-base text-neutral-600">
          Create CPS-centric PolyGraph models, validate correctness, and generate witness
          schedules entirely in the browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/polygraph"
            className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800"
          >
            Open Workspace
          </Link>
          <span className="rounded-full border border-neutral-200 px-6 py-3 text-sm text-neutral-500">
            Client-side verification only
          </span>
        </div>
      </div>
    </div>
  );
}
