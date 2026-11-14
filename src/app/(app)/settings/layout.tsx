import type { ReactNode } from "react";
import { SettingsNav } from "@/components/settings-nav";

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-3xl font-semibold">Settings</h1>
      <SettingsNav />
      {children}
    </div>
  );
}
