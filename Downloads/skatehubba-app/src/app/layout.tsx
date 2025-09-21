import "@/styles/globals.css";

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PropsWithChildren } from "react";
import { Urbanist } from "next/font/google";

import { Providers } from "./providers";

const urbanist = Urbanist({ subsets: ["latin"], variable: "--font-urbanist" });

export const metadata: Metadata = {
  title: "SkateHubba | Real-time S.K.8 Battles",
  description:
    "SkateHubba lets you run live S.K.8 battles with instant video judging, Firebase security, and Niantic-level clarity.",
  applicationName: "SkateHubba",
  manifest: "/manifest.json",
  themeColor: "#050505",
  icons: {
    icon: "/assets/LOGOmain.png",
    apple: "/assets/LOGOmain.png",
  },
  openGraph: {
    title: "SkateHubba",
    description:
      "Create a room, record once, and let your crew judge S.K.8 battles in real time with Firebase-backed integrity.",
    url: "https://skatehubba.app",
    siteName: "SkateHubba",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SkateHubba",
    description: "Live S.K.8 battles with secure Firebase validation and instant uploads.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en" className={`${urbanist.variable} scroll-smooth`}>
      <body className="min-h-screen bg-hubba-black text-neutral-100 antialiased">
        <Providers>
          <a
            href="#main-content"
            className="absolute left-4 top-4 z-50 -translate-y-20 rounded-full bg-hubba-green px-4 py-2 text-sm font-semibold text-hubba-black transition focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-hubba-green/50"
          >
            Skip to content
          </a>
          <div className="relative flex min-h-screen flex-col">
            <header className="sticky top-0 z-40 border-b border-white/10 bg-black/70 backdrop-blur">
              <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
                <Link
                  href="/"
                  className="text-xl font-black tracking-tight text-hubba-green transition hover:scale-[1.02] hover:text-hubba-orange"
                >
                  SkateHubba
                </Link>
                <nav className="flex items-center gap-4 text-sm font-semibold text-neutral-300">
                  <Link
                    href="/"
                    className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-orange"
                  >
                    Home
                  </Link>
                  <a
                    href="https://status.firebase.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-orange"
                  >
                    Firebase Status
                  </a>
                </nav>
              </div>
            </header>
            <main id="main-content" className="flex flex-1 flex-col">
              {children}
            </main>
            <footer className="border-t border-white/10 bg-black/80 py-6 text-sm text-neutral-400">
              <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 px-6 sm:flex-row sm:items-center">
                <p className="font-medium">© {new Date().getFullYear()} SkateHubba Labs.</p>
                <div className="flex gap-4">
                  <Link
                    href="/privacy"
                    className="transition hover:text-hubba-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-orange"
                  >
                    Privacy
                  </Link>
                  <Link
                    href="/terms"
                    className="transition hover:text-hubba-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hubba-orange"
                  >
                    Terms
                  </Link>
                </div>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
