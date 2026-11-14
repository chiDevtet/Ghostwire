import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SessionsPanel } from "@/components/sessions-panel";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { listSessions, type SessionView } from "@/modules/auth";
import { DependencyUnavailableError, logger } from "@/modules/shared";
import { loadShellState } from "../../../_server/shell-state";

export const metadata: Metadata = { title: "Sessions · GHOST WIRE" };

export default async function SessionsPage() {
  const state = await loadShellState();
  if (state.kind === "signed-out") redirect("/");
  if (state.kind === "unavailable") return <ServiceUnavailable variant="section" />;
  let sessions: SessionView[];
  try {
    sessions = await listSessions(state.viewer.pageSession);
  } catch (error) {
    if (!(error instanceof DependencyUnavailableError)) throw error;
    logger.warn("page dependency unavailable", { code: error.code });
    return <ServiceUnavailable variant="section" />;
  }
  return <SessionsPanel sessions={sessions} />;
}
