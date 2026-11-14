"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly tone?: "danger";
}

export interface MenuButtonProps {
  /** Visible content; it stays part of the accessible name (WCAG 2.5.3 label in name). */
  readonly label: ReactNode;
  /** Visually hidden prefix of the button's name, and the menu's aria-label. */
  readonly accessibleLabel: string;
  readonly items: readonly MenuItem[];
}

/**
 * WAI-ARIA menu button. Click, Enter or Space opens and focuses the first item; ArrowDown opens
 * at the first item and ArrowUp at the last. In the menu, ArrowUp/ArrowDown/Home/End move a
 * roving focus, Enter/Space select, Escape closes and returns focus to the button, and Tab or
 * a pointerdown outside closes it.
 */
export function MenuButton({ label, accessibleLabel, items }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const menuId = useId();
  const count = items.length;

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const openAt = (index: number): void => {
    setActive(index);
    setOpen(true);
  };

  const close = (focusButton: boolean): void => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };

  const select = (item: MenuItem | undefined): void => {
    if (item === undefined) return;
    close(true);
    item.onSelect();
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(count - 1);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => (index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => (index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(count - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(items[active]);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onButtonKeyDown}
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-muted px-3 text-sm text-text hover:bg-elevated"
      >
        <span className="sr-only">{accessibleLabel} </span>
        {label}
        <ChevronDown aria-hidden="true" className="size-4" />
      </button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={accessibleLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-40 mt-2 min-w-52 rounded-control border border-border bg-elevated p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              role="menuitem"
              tabIndex={-1}
              onClick={() => select(item)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-control px-3 text-sm focus:bg-surface",
                item.tone === "danger" ? "text-error" : "text-text",
              )}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
