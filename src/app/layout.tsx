import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Link from "next/link";

import { ReownProvider } from "@/components/reown-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AgentRail",
  description: "Autonomous commerce and settlement rail for AI agents and IoT devices.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[radial-gradient(circle_at_top,_#16243b,_#07111f_55%,_#04070d_100%)] text-white">
        <ReownProvider cookies={cookies}>
          <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
            <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium tracking-[0.2em] text-cyan-100 uppercase">
                AgentRail
              </Link>
              <Link href="/buyer" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/8">Buyer</Link>
              <Link href="/provider" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/8">Provider</Link>
              <Link href="/operator" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/8">Operator</Link>
              <Link href="/arbiter" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/8">Arbiter</Link>
            </nav>
          </header>
          {children}
        </ReownProvider>
      </body>
    </html>
  );
}
