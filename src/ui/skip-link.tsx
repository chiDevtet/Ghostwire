/** First focusable element on every page; jumps to <main id="main">. */
export function SkipLink({ href = "#main" }: { readonly href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-control focus:bg-violet focus:px-4 focus:py-2 focus:text-obsidian"
    >
      Skip to content
    </a>
  );
}
