import { vi, type Mock } from "vitest";

/** Shared next/navigation router double for the ui project. */
export const routerMock: {
  readonly replace: Mock;
  readonly refresh: Mock;
  readonly push: Mock;
  readonly back: Mock;
  readonly prefetch: Mock;
} = {
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
};

let pathname = "/dashboard";

export function setPathname(next: string): void {
  pathname = next;
}

/** mockReset() on every routerMock fn and the pathname back to "/dashboard". */
export function resetNavigationMock(): void {
  for (const fn of Object.values(routerMock)) fn.mockReset();
  pathname = "/dashboard";
}

/**
 * Use in a test file:
 * vi.mock("next/navigation", async () => (await import("../../helpers/next-navigation")).navigationMock);
 */
export const navigationMock: {
  readonly useRouter: () => typeof routerMock;
  readonly usePathname: () => string;
} = {
  useRouter: () => routerMock,
  usePathname: () => pathname,
};
