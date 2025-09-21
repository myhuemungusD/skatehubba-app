import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "SkateHubba",
  description:
    "Head-to-head S.K.8 battles with live video, instant judging, and Firebase-backed integrity.",
  appleWebApp: {
    title: "SkateHubba",
    statusBarStyle: "black-translucent",
  },
  manifest: "/manifest.json",
  themeColor: "#ff6400",
};

export const viewport: Viewport = {
  themeColor: "#ff6400",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} bg-[#050505]`}> 
      <body className="min-h-screen bg-gradient-to-br from-black via-[#050505] to-[#101010] text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
