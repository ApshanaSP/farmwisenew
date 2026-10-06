import type { Metadata, Viewport } from "next";
// Plus Jakarta Sans, Geist Mono and Noto Sans Tamil ship with their npm packages (next/font/local), so nothing is fetched from Google at build
// time; networks with TLS inspection block that. Tamil text falls back glyph-by-glyph to Noto Sans Tamil.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/noto-sans-tamil/wght.css";
import "@/components/collector/app/tokens.css";
import "@/components/ui/ui.css";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const THEME_SCRIPT =
  "try{if(localStorage.getItem('diq-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}";

export const metadata: Metadata = {
  title: "District IQ | Chennai Intelligent District Governance Platform",
  description: "One platform for citizens, department officers and the District Collector of Chennai."
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06111C" },
    { media: "(prefers-color-scheme: light)", color: "#F3F6F9" }
  ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} data-theme="light" suppressHydrationWarning>
      <head>
        {/* apply the saved theme before the first paint (shared with the Collector and Officer consoles) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
