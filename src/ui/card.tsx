import type { ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps {
  readonly title?: string;
  /** Default 2. */
  readonly headingLevel?: 2 | 3;
  /** Default "section". */
  readonly as?: "section" | "div" | "article";
  readonly children: ReactNode;
  readonly className?: string;
}

function headingId(title: string): string {
  return `card-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

/** A surface panel. With a title, a section/article is labelled by its heading. */
export function Card({ title, headingLevel = 2, as = "section", children, className }: CardProps) {
  const Tag = as;
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const id = title === undefined ? undefined : headingId(title);
  return (
    <Tag
      aria-labelledby={as !== "div" ? id : undefined}
      className={cn("rounded-card border border-border bg-surface p-5", className)}
    >
      {title !== undefined && (
        <Heading id={id} className="mb-3 font-heading text-lg font-semibold text-text">
          {title}
        </Heading>
      )}
      {children}
    </Tag>
  );
}
