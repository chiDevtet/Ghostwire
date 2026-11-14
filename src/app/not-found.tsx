import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found · GHOST WIRE" };

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-heading text-2xl font-semibold">Page not found.</h1>
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-violet underline underline-offset-4"
      >
        Go to the start page
      </Link>
    </main>
  );
}
