/**
 * Animated ring (aria-hidden) + visible label. Under prefers-reduced-motion the ring is replaced
 * by a static dot; the label is always visible text.
 */
export function Spinner({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        data-part="ring"
        className="size-4 animate-spin rounded-full border-2 border-violet border-t-transparent motion-reduce:hidden"
      />
      <span
        aria-hidden="true"
        data-part="dot"
        className="hidden size-2 rounded-full bg-violet motion-reduce:inline-block"
      />
      <span>{label}</span>
    </span>
  );
}
