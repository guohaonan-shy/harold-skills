/**
 * A real `dyna` for the tests that run a script which starts sessions through it (the two eval runners).
 *
 * Built from the repository's own `dyna/` the first time a test file asks, into a temp dir, and reused for the rest of
 * that file; pass the path as IDEA_LOOP_DYNA_BIN. Needs Go (`REVIEW.md` lists it for the command line's own tests too);
 * a missing Go fails the test with the reason, not silently.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dynaDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dyna');
let built = null;

export function dynaBinary() {
  if (built) return built;
  const out = join(realpathSync(mkdtempSync(join(tmpdir(), 'dyna-test-bin-'))), 'dyna');
  const r = spawnSync('go', ['build', '-o', out, './cmd/dyna'], { cwd: dynaDir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`go build ./cmd/dyna failed (is Go installed?): ${r.stderr || r.error}`);
  built = out;
  return built;
}
