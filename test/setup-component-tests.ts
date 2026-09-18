/**
 * Registers `@testing-library/preact`'s auto-cleanup (S7 plan §7.3). The
 * library only wires itself to a global `afterEach` when one exists, and
 * this project does not set `globals: true` in `vite.config.ts` — nor
 * should it, so the hook is registered explicitly here instead.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/preact";

afterEach(cleanup);
