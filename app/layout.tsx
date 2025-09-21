import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'SkateHubba S.K.8',
  description: 'Play head-to-head games of S.K.8 with realtime scoring powered by SkateHubba.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-hubba-black text-white">
        <div className="flex min-h-screen flex-col bg-gradient-to-br from-hubba-black via-black to-slate-900">
          <main className="flex flex-1 flex-col">{children}</main>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
