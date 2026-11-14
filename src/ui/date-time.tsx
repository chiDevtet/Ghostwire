const FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** "Nov 13, 2026, 10:00 AM UTC". Deterministic on server and client (no hydration mismatch). */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : `${FORMAT.format(date)} UTC`;
}

export function DateTime({ iso }: { readonly iso: string }) {
  return <time dateTime={iso}>{formatUtc(iso)}</time>;
}
