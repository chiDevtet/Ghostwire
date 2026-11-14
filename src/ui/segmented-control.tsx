"use client";

import { Check } from "lucide-react";
import { cn } from "./cn";

export interface SegmentedControlProps<T extends string> {
  readonly legend: string;
  readonly name: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}

/**
 * <fieldset><legend> + one native radio per option, styled as segments. Arrow keys work natively.
 * The checked segment is violet AND shows a Check icon, so colour is never the only signal.
 */
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-silver">{legend}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-muted p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-control px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet",
                checked ? "bg-violet text-obsidian" : "text-text hover:bg-elevated",
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {checked && <Check aria-hidden="true" className="size-4" />}
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
