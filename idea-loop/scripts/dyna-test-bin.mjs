/**
 * A real `dyna` for the tests that need one: the two eval runners, the hook and launcher tests, and the tests of
 * skill text that ask the command line a question (the commands it knows, whether a skill's pointers resolve).
 *
 * Under `dyna test exec` (how `REVIEW.md` runs the tests) the run has already built one and hands it over as
 * DYNA_TEST_BIN: every test file uses that one. Run without it (a bare `node --test`), the repository's own `dyna/` is
 * built the first time a test file asks, into a temp dir that goes when the process exits, and reused for the rest of
 * that file. Pass the path on as IDEA_LOOP_DYNA_BIN. Needs Go (`REVIEW.md` lists it for the command line's own tests
 * too); a missing Go fails the test with the reason, not silently.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dynaDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dyna');
let built = null;

export function dynaBinary() {
  if (built) return built;
  if (process.env.DYNA_TEST_BIN) return (built = process.env.DYNA_TEST_BIN);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dyna-test-bin-')));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, 'dyna');
  const r = spawnSync('go', ['build', '-o', out, './cmd/dyna'], { cwd: dynaDir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`go build ./cmd/dyna failed (is Go installed?): ${r.stderr || r.error}`);
  built = out;
  return built;
}

/** Run the built `dyna` with these arguments. `env` is the whole environment of the child (PATH and HOME are kept unless given). */
export function runDyna(args, { cwd, env = {}, input } = {}) {
  return spawnSync(dynaBinary(), args, {
    cwd,
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}

/** The commands of the built `dyna`, as the registry lists them: a Set of `issues set`, `home map`, … */
export function dynaCommands() {
  const r = runDyna(['registry', '--json']);
  if (r.status !== 0) throw new Error(`dyna registry --json failed: ${r.stderr}`);
  return new Set(JSON.parse(r.stdout).commands.map((c) => c.command));
}
