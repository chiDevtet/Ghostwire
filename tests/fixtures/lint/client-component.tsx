"use client";
import { useRouter } from "next/navigation";
import { useWallets } from "@/modules/wallet-connect";
import { Button } from "@/ui/button";
export function Probe() {
  const router = useRouter();
  const wallets = useWallets();
  return <Button onClick={() => router.refresh()}>{wallets.length}</Button>;
}
