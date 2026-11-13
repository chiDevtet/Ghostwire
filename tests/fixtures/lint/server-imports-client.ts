import { useWallets } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
import { AppShell } from "@/components/app-shell/app-shell";
export const probe = [useWallets, Button, AppShell];
