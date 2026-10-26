import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/layout/site";

export const metadata: Metadata = {
  title: { default: "KindSpring – Real People. Verified Needs. Lasting Change.", template: "%s · KindSpring" },
  description:
    "KindSpring connects people with verified humanitarian needs in Nigeria with individuals, businesses and foundations who want to help. Every case is investigated before it is published.",
};

export const viewport: Viewport = { themeColor: "#123C3A", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG">
      <body className="flex min-h-screen flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
