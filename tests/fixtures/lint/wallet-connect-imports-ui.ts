import { Button } from "@/ui/button";
import { AppShell } from "@/components/app-shell/app-shell";
export const lazy = () => import("@/ui/button");
export const probe = [Button, AppShell];
