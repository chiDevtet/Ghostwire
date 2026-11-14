"use client";

import { useEffect } from "react";
import { onUnauthenticated } from "@/modules/wallet-connect";
import { useToast } from "@/ui/toast";
import { useFreshNavigation } from "./use-fresh-navigation";

/**
 * Mounted only inside the (app) shell: any API call that answers UNAUTHENTICATED shows a toast
 * and returns to the start page. Renders nothing.
 */
export function SessionExpiredHandler(): null {
  const toast = useToast();
  const navigate = useFreshNavigation();
  useEffect(
    () =>
      onUnauthenticated(() => {
        toast.show({ message: "Your session ended. Sign in again to continue." });
        navigate("/");
      }),
    [toast, navigate],
  );
  return null;
}
