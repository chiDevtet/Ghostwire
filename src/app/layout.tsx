import "./globals.css";
import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { SkipLink } from "@/ui/skip-link";
import { ToastProvider } from "@/ui/toast";
import { geistMono, inter, spaceGrotesk } from "./fonts";

export const metadata: Metadata = {
  title: "GHOST WIRE",
  description: "Your money. Your business. Your privacy.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Every page renders per request, so the proxy's CSP nonce reaches every page (spike §9.4).
  await connection();
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh bg-obsidian font-sans text-text antialiased">
        <SkipLink />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
