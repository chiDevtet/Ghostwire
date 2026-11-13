import { env as importedEnv } from "node:process";

export const direct = process.env.MONGODB_URI;
const { env } = process;
export const viaGlobal = globalThis.process.env.MONGODB_URI;
export const all = [importedEnv, env];
