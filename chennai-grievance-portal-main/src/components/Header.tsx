"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Phone, UserRound } from "lucide-react";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export interface HeaderNavItem {
  href: string;
  label: string;
}

interface HeaderProps {
  userName?: string | null;
  homeHref?: string;
  /**
   * Primary destinations for the signed-in role. The citizen landing page no
   * longer repeats "File a complaint" / "Track status" in its body, so these
   * links are how those pages are reached.
   */
  nav?: HeaderNavItem[];
}

export default function Header({ userName, homeHref = "/", nav = [] }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="diq-top">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href={homeHref} className={`group flex items-center gap-3 ${nav.length > 0 ? "border-r border-canvas-border pr-4" : ""}`}>
          <Logo className="h-[34px] w-[34px] transition-transform duration-300 ease-spring group-hover:scale-105" />
          <span className="leading-tight">
            <span className="block text-[15px] font-extrabold uppercase leading-none tracking-[0.11em] text-ink">
              District <span className="text-navy-500">IQ</span>
            </span>
            <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.17em] text-ink-subtle">
              {nav.length > 0 ? "Citizen Portal · Chennai" : "Chennai District Intelligence"}
            </span>
          </span>
        </Link>

        {nav.length > 0 && (
          <nav aria-label="Primary" className="mr-auto hidden items-center rounded-[10px] border border-canvas-border bg-canvas-sunken p-0.5 sm:flex">
            {nav.map(({ href, label }) => {
              const active = pathname === href || (href !== homeHref && pathname.startsWith(href + "/"));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-[8px] px-3.5 py-1.5 text-[13px] font-semibold transition ${
                    active ? "bg-brand text-white shadow-brand" : "text-ink-subtle hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <a href="tel:1913" className="diq-tbtn hidden md:inline-flex" title="GCC helpline, 24x7">
            <Phone className="h-4 w-4" aria-hidden="true" />
            Helpline <b className="text-ink">1913</b>
          </a>
          <ThemeToggle />
          {userName !== undefined && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-[10px] py-1 pl-1 pr-2 text-[13px] font-semibold text-ink transition hover:bg-canvas-sunken focus-visible:ring-4 focus-visible:ring-navy-600/20"
              >
                <span
                  aria-hidden="true"
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
                >
                  {(userName || "U").charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[160px] truncate sm:inline">{userName || "My Account"}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 text-ink-subtle transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-60 origin-top-right animate-scale-in overflow-hidden rounded-[14px] border border-canvas-border bg-canvas-raised p-2 shadow-lift"
                >
                  {nav.length > 0 && (
                    <div className="sm:hidden">
                      {nav.map(({ href, label }) => (
                        <Link
                          key={href}
                          href={href}
                          role="menuitem"
                          className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-navy-50 hover:text-navy-700"
                          onClick={() => setMenuOpen(false)}
                        >
                          {label}
                        </Link>
                      ))}
                      <div className="my-1.5 border-t border-canvas-border" />
                    </div>
                  )}
                  <Link
                    href="/profile"
                    role="menuitem"
                    className="flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-navy-50 hover:text-navy-700"
                    onClick={() => setMenuOpen(false)}
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    My Profile
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    {loggingOut ? "Logging out..." : "Logout"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
