"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FilePlus2, Home, LayoutGrid, LogOut, Phone, Search, UserRound } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import { useIndicator } from "@/components/ui";
import { spring } from "@/components/ui/motion";
import "@/components/citizen/citizen.css";

export interface HeaderNavItem {
  href: string;
  label: string;
}

interface HeaderProps {
  userName?: string | null;
  homeHref?: string;
  /** Primary destinations for the signed-in role (Overview · File a Complaint · Track Status for citizens). */
  nav?: HeaderNavItem[];
  /** the line after the logo's hairline ("Citizen · Chennai") */
  sub?: string;
}

const TAB_ICON: Record<string, typeof Home> = { "/citizen": LayoutGrid, "/citizen/file-complaint": FilePlus2, "/citizen/track-complaints": Search };
const initialsOf = (name: string) => name.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/**
 * The citizen portal's top bar, the consoles' own (marina.css .top): white, 60 px; the logo and the place after a hairline; the
 * pages as tabs with a green bar under the one you are on (it slides to the next); the 1913 helpline, English / தமிழ், the theme
 * and the account with its menu. Under 1024 px the pages move to a bottom bar, as on the consoles.
 */
export default function Header({ userName, homeHref = "/", nav = [], sub }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<HTMLButtonElement>(null);
  const activeHref = nav.find(({ href }) => pathname === href || (href !== homeHref && pathname.startsWith(href + "/")))?.href ?? null;
  const { ref: navRef, box, animateNow } = useIndicator<HTMLElement>(activeHref, [nav.length]);
  const name = userName || "My account";
  const citizen = nav.length > 0;

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") { setMenuOpen(false); meRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className={`cz-top${citizen ? " has-tabs" : ""}`}>
        <Link href={homeHref} className="cz-brand">
          <Wordmark className="cz-wm" />
          <small className="cz-tsub">{sub ?? (citizen ? "Citizen · Chennai" : "Chennai")}</small>
        </Link>

        {citizen && (
          <nav ref={navRef} aria-label="Primary" className="cz-tabs hidden lg:flex">
            {nav.map(({ href, label }) => {
              const active = href === activeHref;
              const Icon = TAB_ICON[href] ?? Home;
              return (
                <Link key={href} href={href} data-key={href} aria-current={active ? "page" : undefined} className="cz-tab">
                  <Icon aria-hidden="true" /><span>{label}</span>
                </Link>
              );
            })}
            {box && (
              <motion.span aria-hidden="true" className="cz-tab-bar" initial={false} animate={{ x: box.x, width: box.w }}
                transition={animateNow ? spring.snappy : { duration: 0 }} />
            )}
          </nav>
        )}

        <div className="cz-tright">
          <a href="tel:1913" className="cz-tbtn cz-help" title="GCC helpline, 24x7 (tap to call)">
            <Phone className="cz-help-ic" aria-hidden="true" />
            Helpline <b>1913</b>
          </a>
          <LangToggle />
          <ThemeToggle />
          {userName !== undefined && (
            <div className="cz-acct" ref={menuRef}>
              {/* a fixed name: the person's name is shown, never sent to the translator (names stay as typed) */}
              <button ref={meRef} type="button" className="cz-me" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-controls="cz-account"
                aria-label="Account menu">
                <span className="cz-avatar" aria-hidden="true" translate="no">{initialsOf(name)}</span>
                <span className="cz-who" aria-hidden="true"><small>Signed in as</small><b translate="no">{name}</b></span>
                <ChevronDown className="cz-chev" aria-hidden="true" />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div id="cz-account" className="cz-pop" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16 }}>
                    <div className="cz-pop-me">
                      <span className="cz-avatar" aria-hidden="true" translate="no">{initialsOf(name)}</span>
                      <span><b translate="no">{name}</b><small>{citizen ? "Citizen · Chennai" : "Signed in"}</small></span>
                    </div>
                    <Link href="/profile" className="cz-pop-i" onClick={() => setMenuOpen(false)}>
                      <span className="cz-pop-ic"><UserRound aria-hidden="true" /></span>
                      <span><b>My profile</b><small>Contact details and password</small></span>
                    </Link>
                    {citizen && (
                      <Link href="/citizen/track-complaints" className="cz-pop-i" onClick={() => setMenuOpen(false)}>
                        <span className="cz-pop-ic"><Search aria-hidden="true" /></span>
                        <span><b>My complaints</b><small>Where each one is now</small></span>
                      </Link>
                    )}
                    <button type="button" className="cz-pop-i out" disabled={loggingOut} onClick={handleLogout}>
                      <span className="cz-pop-ic"><LogOut aria-hidden="true" /></span>
                      <span><b>{loggingOut ? "Signing out..." : "Sign out"}</b></span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>

      {/* phones and tablets (under 1024 px, where the top bar has no room for the pages): the pages as a bottom bar, as on the consoles */}
      {citizen && (
        <nav aria-label="Primary" className="cz-bbar lg:hidden">
          <div className="cz-bbar-in">
            {nav.map(({ href, label }) => {
              const active = href === activeHref;
              const Icon = TAB_ICON[href] ?? Home;
              return (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`${active ? "text-navy-700" : "text-ink-subtle"}`}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
