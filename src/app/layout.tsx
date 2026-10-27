import type { Metadata, Viewport } from "next";
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { cookies } from "next/headers";
import { SiteFooter, SiteHeader } from "@/components/layout/site";
import { Notice } from "@/components/ui/form";

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} – ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: `${BRAND.name} connects people with verified humanitarian needs in Nigeria with individuals, businesses and foundations who want to help. Every case is investigated before it is published.`,
};

export const viewport: Viewport = { themeColor: "#c8174f", width: "device-width", initialScale: 1 };

function decodeNotice(v: string | undefined) {
  try {
    return v ? decodeURIComponent(v).slice(0, 300) : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const notice = decodeNotice((await cookies()).get("ks_notice")?.value);
  return (
    <html lang="en-NG">
      <body className="flex min-h-screen flex-col overflow-x-clip font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Notice initial={notice} />
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
