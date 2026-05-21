import {
  init_esm_shims
} from "./chunk-ZWU7KJPP.js";

// ../cli/src/commands/arg-utils.ts
init_esm_shims();
var UnknownFlagError = class extends Error {
  /** The offending argv entry, e.g. "--dyr-run". */
  flag;
  /** The command label used to compose the error message. */
  command;
  constructor(command, flag) {
    super(`${command}: unknown flag "${flag}". Run 'teamagent --help' for valid flags.`);
    this.name = "UnknownFlagError";
    this.command = command;
    this.flag = flag;
  }
};
function assertNoUnknownFlags(command, argv, knownFlags) {
  for (const a of argv) {
    if (typeof a !== "string") continue;
    if (!a.startsWith("--")) continue;
    const base = a.split("=")[0];
    if (!knownFlags.has(base)) {
      throw new UnknownFlagError(command, a);
    }
  }
}
export {
  UnknownFlagError,
  assertNoUnknownFlags
};
