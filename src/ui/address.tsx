"use client";

import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";
import { cn } from "./cn";

const STATUS_CLEAR_MS = 2000;

/** "AbCd…WxYz" (4 + "…" + 4); values of 10 characters or fewer are returned unchanged. */
export function truncateAddress(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export interface AddressProps {
  readonly value: string;
  readonly copyable?: boolean;
  readonly className?: string;
}

/**
 * Mono, truncated text; the full value is in visually hidden text and `title`. `copyable` adds a
 * "Copy address" button whose own status region announces the result and clears after 2 s.
 */
export function Address({ value, copyable = false, className }: AddressProps) {
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (status === "") return;
    const timer = setTimeout(() => setStatus(""), STATUS_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Address copied");
    } catch {
      setStatus("Couldn't copy the address");
    }
  };

  const text = (
    <span className={cn("font-mono", className)} title={value}>
      <span aria-hidden="true">{truncateAddress(value)}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
  if (!copyable) return text;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {text}
      <Button variant="ghost" className="px-2 text-xs" onClick={() => void copy()}>
        <Copy aria-hidden="true" className="size-4" />
        Copy address
      </Button>
      <span role="status" className="sr-only">
        {status}
      </span>
    </span>
  );
}
