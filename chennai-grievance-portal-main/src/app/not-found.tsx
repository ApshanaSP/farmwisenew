import Link from "next/link";

/** The page for an address that does not exist. Its text sits in a main landmark so a screen reader can reach it (SK2-15). */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink">This page does not exist</h1>
      <p className="text-ink-muted">The address may be wrong, or the page may have moved.</p>
      <Link href="/" className="btn-primary">Go to the home page</Link>
    </main>
  );
}
