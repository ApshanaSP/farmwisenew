import Link from "next/link";
import { ReactNode } from "react";
import { Phone } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import AuthHero from "@/components/auth/AuthHero";
import AuthCard from "@/components/auth/AuthCard";
import "@/components/citizen/citizen.css";

/**
 * One entrance for citizens, department officers and the Collector: the consoles' white top bar (the logo, the place, the
 * helpline, English / தமிழ் and the theme), then a split screen, the green hero map on the left (55%) and the form on a white
 * card on the right (45%), sized so the page never scrolls on a laptop. On a phone the form alone, full width.
 */
export default function AuthShell({ children, headline }: { children: ReactNode; headline?: ReactNode }) {
  return (
    <div className="auth-bg flex h-[100dvh] min-h-[600px] flex-col overflow-hidden">
      <header className="cz-top relative z-20 flex-none">
        <Link href="/" title="District IQ home" className="cz-brand">
          <Wordmark className="cz-wm" />
          <small className="cz-tsub">Chennai</small>
        </Link>
        <div className="cz-tright">
          <a href="tel:1913" className="cz-tbtn cz-help" title="Helpline, 24x7">
            <Phone className="cz-help-ic" aria-hidden="true" />
            Helpline <b>1913</b>
          </a>
          <LangToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <AuthHero headline={headline ?? <>One platform for Chennai&apos;s citizens, officers and Collector.</>} />
        {/* the card centres itself with auto margins: a flex `items-center` pushed a form taller than the window (sign-up at 1366 x 680, any
            form on a short phone) above the scroll's top, where it could not be reached */}
        <section className="relative flex min-h-0 justify-center overflow-y-auto px-4 py-6 sm:px-10">
          <AuthCard>{children}</AuthCard>
        </section>
      </main>

      <Footer compact />
    </div>
  );
}
