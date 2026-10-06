"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Home, LogOut, Phone, Plus, Search, UserRound } from "lucide-react";
import BrandWordmark from "@/components/BrandWordmark";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, useIndicator } from "@/components/ui";
import { spring } from "@/components/ui/motion";

export interface HeaderNavItem {
  href: string;
  label: string;
}

interface HeaderProps {
  userName?: string | null;
  homeHref?: string;
  /** Primary destinations for the signed-in role (Overview · File a Complaint · Track Status for citizens). */
  nav?: HeaderNavItem[];
}

const TAB_ICON: Record<string, typeof Home> = { "/citizen": Home, "/citizen/file-complaint": Plus, "/citizen/track-complaints": Search };

/**
 * The citizen portal's glass top bar (64px): brand, the pages with a sliding pill on the active one, the 1913 helpline,
 * the theme toggle and the account menu. On phones the pages move to a bottom tab bar with a raised "+ File" button.
 */
export default function Header({ userName, homeHref = "/", nav = [] }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeHref = nav.find(({ href }) => pathname === href || (href !== homeHref && pathname.startsWith(href + "/")))?.href ?? null;
  const { ref: navRef, box, animateNow } = useIndicator<HTMLElement>(activeHref, [nav.length]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="diq-top">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link href={homeHref} className="group flex-none rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy-600/25">
            <BrandWordmark sub={nav.length > 0 ? "Citizen portal · Chennai" : "Chennai"} />
          </Link>

          {nav.length > 0 && (
            <nav ref={navRef} aria-label="Primary" className="relative ml-4 hidden items-center gap-1 rounded-[10px] border border-canvas-border bg-canvas-sunken/70 p-1 sm:flex">
              {box && (
                <motion.span aria-hidden="true" className="absolute left-0 top-1 h-[calc(100%-8px)] rounded-[7px] bg-brand shadow-brand"
                  initial={false} animate={{ x: box.x, width: box.w }} transition={animateNow ? spring.snappy : { duration: 0 }} />
              )}
              {nav.map(({ href, label }) => {
                const active = href === activeHref;
                return (
                  <Link key={href} href={href} data-key={href} aria-current={active ? "page" : undefined}
                    className={`relative z-[1] rounded-[7px] px-3.5 py-1.5 text-[13.5px] font-medium transition-colors duration-150 ${active ? "text-white" : "text-ink-subtle hover:text-ink"}`}>
                    {label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            <a href="tel:1913" className="diq-tbtn hidden md:inline-flex" title="GCC helpline, 24x7 (tap to call)">
              <Phone className="h-4 w-4 text-navy-500" aria-hidden="true" />
              Helpline <b className="font-mono text-ink">1913</b>
            </a>
            <ThemeToggle />
            {userName !== undefined && (
              <div className="relative" ref={menuRef}>
                <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={menuOpen}
                  className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 text-[13px] font-semibold text-ink transition hover:bg-canvas-sunken focus-visible:ring-4 focus-visible:ring-navy-600/20">
                  <Avatar name={userName || "U"} />
                  <span className="hidden max-w-[160px] truncate sm:inline">{userName || "My Account"}</span>
                  <ChevronDown aria-hidden="true" className={`h-4 w-4 text-ink-subtle transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {menuOpen && (
                    <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.16 }} style={{ transformOrigin: "top right" }}
                      className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-[12px] border border-canvas-border bg-canvas-raised/95 p-1.5 shadow-lift backdrop-blur-xl">
                      <div className="px-3 pb-2 pt-1.5">
                        <p className="truncate text-[13px] font-semibold text-ink">{userName || "My Account"}</p>
                        <p className="text-[11.5px] text-ink-subtle">Signed in</p>
                      </div>
                      <div className="my-1 border-t border-canvas-border" />
                      <Link href="/profile" role="menuitem" onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-canvas-sunken">
                        <UserRound className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                        My Profile
                      </Link>
                      <button role="menuitem" type="button" disabled={loggingOut} onClick={handleLogout}
                        className="flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60">
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {loggingOut ? "Signing out..." : "Sign out"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* phones: bottom tab bar with the raised "+ File" in the middle */}
      {nav.length > 0 && (
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-canvas-border bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
          <div className="grid h-16 grid-cols-3 items-center">
            {nav.map(({ href, label }) => {
              const active = href === activeHref;
              const Icon = TAB_ICON[href] ?? Home;
              const file = href.endsWith("/file-complaint");
              return file ? (
                <Link key={href} href={href} aria-current={active ? "page" : undefined} className="flex flex-col items-center gap-1 text-[11px] font-semibold text-ink">
                  <span className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-brand ring-4 ring-canvas"><Plus className="h-6 w-6" aria-hidden="true" /></span>
                  File
                </Link>
              ) : (
                <Link key={href} href={href} aria-current={active ? "page" : undefined}
                  className={`flex min-h-[44px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-navy-500" : "text-ink-subtle"}`}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {label.replace(" Status", "")}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
