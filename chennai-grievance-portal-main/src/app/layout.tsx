import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";

// Loaded by the browser, as on the collector and officer pages: next/font would fetch at build time, which some
// networks (TLS inspection) block. globals.css falls back to system fonts if this cannot load.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap";

const THEME_SCRIPT =
  "try{if(localStorage.getItem('diq-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}";

export const metadata: Metadata = {
  title: "District IQ | Chennai Intelligent District Governance Platform",
  description: "One platform for citizens, department officers and the District Collector of Chennai."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS} />
        {/* apply the saved theme before the first paint (shared with the Collector and Officer consoles) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
