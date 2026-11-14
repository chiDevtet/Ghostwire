"use client";

import { useState, type FormEvent } from "react";
import type { AccountOption } from "@/modules/wallet-connect";
import { Address } from "@/ui/address";
import { Button } from "@/ui/button";

/** Shown only when the wallet connected more than one account. */
export function AccountPicker({
  accounts,
  onChoose,
}: {
  readonly accounts: readonly AccountOption[];
  readonly onChoose: (address: string) => void;
}) {
  const [selected, setSelected] = useState(accounts[0]?.address ?? "");
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onChoose(selected);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-silver">Choose an account</legend>
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <label
              key={account.address}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-muted px-3 text-sm"
            >
              <input
                type="radio"
                name="account"
                value={account.address}
                checked={selected === account.address}
                onChange={() => setSelected(account.address)}
                className="size-4 accent-violet"
              />
              <span className="flex flex-col">
                {account.label !== null && <span>{account.label}</span>}
                <Address value={account.address} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit">Continue</Button>
    </form>
  );
}
