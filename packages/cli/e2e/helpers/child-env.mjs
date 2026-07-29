/**
 * The environment every e2e child process runs in.
 *
 * Each of these files used to spread `...process.env` and add `CI` and
 * `NO_COLOR` inline. That inherits whatever the developer's shell exports, and
 * one such variable actively breaks the suite: with `FORCE_COLOR` set — kitty,
 * several CI-adjacent tools and some agent harnesses set it — node prints
 *
 *   Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
 *
 * on **stderr**, and three of the command-set assertions require stderr to be
 * exactly the CLI's own output. So the suite passed in CI (which sets neither)
 * and failed on a developer machine, which is the worst possible split: the
 * failure looks like a real regression in whatever was last touched.
 *
 * `NO_COLOR` cannot simply be dropped in favour of `FORCE_COLOR`. Assertions
 * here match plain substrings, so the child has to emit uncoloured text; the
 * conflict has to be resolved by removing the other variable, not by picking a
 * different one.
 */

/**
 * Variables deleted rather than overridden. `delete` is required — setting
 * `FORCE_COLOR: ""` still counts as *set* to node's colour detection and the
 * warning fires anyway.
 */
const STRIPPED = ["FORCE_COLOR", "CLICOLOR_FORCE"];

/**
 * `CI: "true"` is not incidental either: it is what makes `isInteractive()`
 * false, so a child that would otherwise render a prompt refuses instead of
 * hanging a test forever.
 *
 * An `extra` entry set to `undefined` DELETES that variable rather than setting
 * it to the string "undefined" — `http-registry` relies on this to prove that an
 * unset `${TOKEN}` refuses before any request is made, and spreading a plain
 * object would not do it.
 */
export function childEnv(extra = {}) {
  const env = { ...process.env, CI: "true", NO_COLOR: "1", ...extra };
  for (const name of STRIPPED) delete env[name];
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
  }
  return env;
}
