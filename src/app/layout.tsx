import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";

import { ReownProvider } from "@/components/reown-provider";
import { Navigation } from "@/components/navigation";
import { InteractiveTutorial } from "@/components/interactive-tutorial";

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
      <body className="min-h-full flex flex-col font-mono text-white selection:bg-brut-red selection:text-black">
        <ReownProvider cookies={cookies}>
          <header className="sticky top-0 z-40 border-b-2 border-brut-red bg-black/90 backdrop-blur shadow-[0px_4px_0px_0px_var(--brut-red)] mb-6">
            <Navigation />
          </header>
          <InteractiveTutorial />
          {children}
        </ReownProvider>
      </body>
    </html>
  );
}
