import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetNavigationMock } from "../helpers/next-navigation";

// RTL's automatic cleanup needs Vitest globals, which this repo keeps off.
afterEach(() => {
  cleanup();
  resetNavigationMock();
});
