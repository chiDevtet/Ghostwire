import { cookies } from "next/headers";
import { notFound, redirect, useRouter } from "next/navigation";
export const lazy = () => import("next/headers");
export const probe = [cookies, notFound, redirect, useRouter];
