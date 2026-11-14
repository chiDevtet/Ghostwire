const MAX_LENGTH = 32;

/**
 * A wallet's display name as the server's provider id (PROVIDER_PATTERN /^[a-z0-9_-]{1,32}$/):
 * lowercase, every run of other characters becomes "-", leading and trailing "-" trimmed, cut
 * to 32 characters. "Phantom" → "phantom". undefined when nothing is left.
 */
export function toProviderId(walletName: string): string | undefined {
  const id = walletName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH);
  return id === "" ? undefined : id;
}
