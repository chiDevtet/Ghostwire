import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "GHOST WIRE",
  description: "Your money. Your business. Your privacy.",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Every page renders per request, so the proxy's CSP nonce reaches every page (spike §9.4).
  await connection();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
