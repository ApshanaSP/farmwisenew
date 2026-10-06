import Link from "next/link";
import { ReactNode } from "react";
import { Phone } from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import AuthHero from "@/components/auth/AuthHero";
import AuthCard from "@/components/auth/AuthCard";

/**
 * One entrance for citizens, department officers and the Collector: a slim glass top bar, then a split screen,
 * the hero map on the left (55%) and the auth card on the right (45%), sized so the page never scrolls on a laptop.
 */
export default function AuthShell({ children, headline }: { children: ReactNode; headline?: ReactNode }) {
  return (
    <div className="auth-bg flex h-[100dvh] min-h-[600px] flex-col overflow-hidden">
      <header className="diq-top relative z-20 flex-none">
        <div className="flex h-[56px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy-600/25"><BrandWordmark size={32} /></Link>
          <div className="flex items-center gap-2">
            <a href="tel:1913" className="diq-tbtn hidden sm:inline-flex" title="Helpline, 24x7">
              <Phone className="h-4 w-4 text-navy-500" aria-hidden="true" />
              Helpline <b className="font-mono text-ink">1913</b>
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 lg:grid-cols-[55fr_45fr]">
        <AuthHero headline={headline ?? <>One platform for Chennai&apos;s citizens, officers and Collector.</>} />
        <section className="relative flex min-h-0 items-center justify-center overflow-y-auto px-5 py-6 sm:px-10">
          <AuthCard>{children}</AuthCard>
        </section>
      </main>

      <Footer compact />
    </div>
  );
}
