import Logo from "@/components/Logo";
import { IST } from "@/lib/ist-dates";
import "@/components/citizen/citizen.css";

/**
 * District IQ · Chennai Intelligent District Governance Platform · Helpline 1913: one quiet line on the page's white, as the
 * consoles keep their own chrome to the top bar. Under 1024 px it keeps clear of the bottom bar (mb-16, the bar's 60 px).
 */
export default function Footer({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`cz-foot${compact ? " compact" : " mb-16 lg:mb-0"}`}>
      <div className="cz-foot-in">
        <div className="flex items-center gap-2.5">
          <Logo className={compact ? "h-5 w-5" : "h-6 w-6"} />
          <p>
            <b>District IQ</b> &middot; Chennai Intelligent District Governance Platform &middot; Helpline{" "}
            <a href="tel:1913">1913</a>
          </p>
        </div>
        <p>
          24&times;7 &middot; &copy; {new Date().toLocaleDateString("en-IN", { ...IST, year: "numeric" })} District Administration, Chennai
        </p>
      </div>
    </footer>
  );
}
