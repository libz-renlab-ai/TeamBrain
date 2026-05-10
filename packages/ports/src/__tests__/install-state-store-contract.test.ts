/**
 * Smoke test that locks the InstallStateStore contract against the
 * in-memory fake from the contract module itself.
 *
 * The real fs adapter (`FsInstallStateStore`) re-runs the same suite
 * from `packages/cli/src/__tests__/install-state-fs-store.test.ts`,
 * which guarantees the two implementations agree.
 */
import { describe } from "vitest";
import {
  InMemoryInstallStateStore,
  runInstallStateStoreContract,
} from "./install-state-store-contract.js";

describe("InMemoryInstallStateStore", () => {
  runInstallStateStoreContract(async () => ({
    store: new InMemoryInstallStateStore(),
  }));
});
