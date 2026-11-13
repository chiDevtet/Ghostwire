import { loadConfig } from "@/modules/config";
import { ObjectId } from "mongodb";
import { randomBytes } from "node:crypto";
import type { MeView } from "@/modules/auth";
import { SOLANA_NETWORK_IDS } from "@/modules/validation";
export const lazy = () => import("@/modules/database");
export const probe: unknown[] = [loadConfig, ObjectId, randomBytes, SOLANA_NETWORK_IDS];
export type Probe = MeView;
