/**
 * How many matrices `ui-measure.mjs` walks at once, from what this machine has
 * free right now. Pure: the caller reads the machine and passes the numbers in.
 *
 * Costs below were measured on 0.1.26 (Tofelair PR 966, 4 matrices × 27 cells,
 * process tree incl. Chromium): one browser ≈ 0.6 GiB, each extra matrix ≈ 0.5 GiB
 * (1 → 1.0 GiB, 2 → 1.7 GiB, 4 → 2.4 GiB); each matrix keeps ≈ 1 core busy
 * between the script's tree and the dev server it loads. Running more matrices
 * than idle cores did not change a measurement-layer finding, but it did push
 * pixel percentages near the 1% budget across it (busy machine, 4 at once: 56
 * extra pixel-mismatch), so CPU is a real limit, not just a speed knob.
 *
 * Idle cores are sampled (os.cpus() twice), not read off the load average: on
 * macOS the load average ran at 23.8 on 12 cores while 3.1 cores were idle.
 */

export const MAX_CONCURRENCY = 4;
export const BROWSER_BYTES = 0.6 * 2 ** 30;
export const PER_MATRIX_BYTES = 0.5 * 2 ** 30;
export const PER_MATRIX_CORES = 1;

/**
 * @param {object} o
 * @param {number} o.matrices        matrices in this run
 * @param {number} [o.requested]     --concurrency, if given (still capped at MAX_CONCURRENCY)
 * @param {number} o.cpus            logical cores (os.availableParallelism())
 * @param {number} o.idleCores       cores idle right now (sampleIdleCores())
 * @param {number} o.availableBytes  memory the OS can hand out now (process.availableMemory())
 * @returns {{ concurrency: number, reason: string }}
 */
export function pickConcurrency({ matrices, requested, cpus, idleCores, availableBytes }) {
  const cap = Math.max(1, Math.min(MAX_CONCURRENCY, matrices));
  if (requested !== undefined) {
    const concurrency = Math.max(1, Math.min(requested, cap));
    return { concurrency, reason: `--concurrency ${requested}${concurrency !== requested ? `，按上限 ${cap} 截断` : ''}` };
  }
  const memSlots = Math.floor((availableBytes - BROWSER_BYTES) / PER_MATRIX_BYTES);
  const cpuSlots = Math.floor(idleCores / PER_MATRIX_CORES);
  const concurrency = Math.max(1, Math.min(cap, memSlots, cpuSlots));
  const gib = (b) => (b / 2 ** 30).toFixed(1);
  return {
    concurrency,
    reason: `可用内存 ${gib(availableBytes)} GiB 够 ${Math.max(0, memSlots)} 份，`
      + `空闲 CPU ${Math.max(0, idleCores).toFixed(1)} 核（共 ${cpus} 核）够 ${Math.max(0, cpuSlots)} 份，`
      + `上限 ${cap}（${matrices} 份矩阵，最多 ${MAX_CONCURRENCY}）`,
  };
}

/** Cores idle over a short window, from the kernel's per-core time counters. */
export async function sampleIdleCores(cpusFn, ms = 500) {
  const sum = () => cpusFn().reduce((a, { times: t }) => {
    a.idle += t.idle;
    a.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return a;
  }, { idle: 0, total: 0 });
  const before = sum();
  await new Promise((r) => setTimeout(r, ms));
  const after = sum();
  const total = after.total - before.total;
  return total > 0 ? ((after.idle - before.idle) / total) * cpusFn().length : cpusFn().length;
}
