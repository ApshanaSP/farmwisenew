import Logo from "@/components/Logo";

/** District IQ · Chennai Intelligent District Governance Platform · Helpline 1913 */
export default function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`mt-auto border-t border-canvas-border bg-canvas/70 backdrop-blur ${compact ? "" : "mb-16 sm:mb-0"}`}>
      <div
        className={`mx-auto flex max-w-[1200px] flex-col items-center gap-2 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left ${
          compact ? "py-2.5" : "py-6"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Logo className={compact ? "h-5 w-5" : "h-7 w-7"} />
          <p className="text-[13px] text-ink-muted">
            <span className="font-semibold text-ink">District IQ</span> &middot; Chennai Intelligent District Governance Platform &middot; Helpline{" "}
            <a href="tel:1913" className="font-mono font-semibold text-ink hover:text-navy-500">1913</a>
          </p>
        </div>
        <p className="text-[12.5px] text-ink-subtle">
          24&times;7 &middot; &copy; {new Date().getFullYear()} District Administration, Chennai
        </p>
      </div>
    </footer>
  );
}
