import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans"
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["600", "700", "800"],
  variable: "--font-display"
});

const THEME_SCRIPT =
  "try{if(localStorage.getItem('diq-theme')==='light')document.documentElement.dataset.theme='light'}catch(e){}";

export const metadata: Metadata = {
  title: "District IQ | Chennai Intelligent District Governance Platform",
  description: "One platform for citizens, department officers and the District Collector of Chennai."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* apply the saved theme before the first paint (shared with the Collector and Officer consoles) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
