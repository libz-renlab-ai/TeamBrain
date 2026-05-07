export interface IsEnabledOpts {
  cliFlag?: boolean;
  env?: NodeJS.ProcessEnv;
}

export function isDuckModeEnabled(opts: IsEnabledOpts = {}): boolean {
  if (opts.cliFlag === true) return true;
  if (opts.cliFlag === false) return false;
  const env = opts.env ?? process.env;
  return env.TEAMAGENT_EXPLAIN_LIKE_CEO_DUCK === "1";
}
