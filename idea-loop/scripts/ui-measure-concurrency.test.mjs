import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickConcurrency, sampleIdleCores } from './ui-measure-concurrency.mjs';

const GiB = 2 ** 30;
const idle = { cpus: 12, idleCores: 10, availableBytes: 8 * GiB };

test('an idle machine runs four matrices at once, never more', () => {
  assert.equal(pickConcurrency({ ...idle, matrices: 4 }).concurrency, 4);
  assert.equal(pickConcurrency({ ...idle, matrices: 9 }).concurrency, 4);
});

test('never more slots than matrices', () => {
  assert.equal(pickConcurrency({ ...idle, matrices: 2 }).concurrency, 2);
  assert.equal(pickConcurrency({ ...idle, matrices: 1 }).concurrency, 1);
});

test('memory limits it: 0.6 GiB browser + 0.5 GiB a matrix', () => {
  // 2.4 GiB available → (2.4 − 0.6) / 0.5 = 3.6 → 3
  assert.equal(pickConcurrency({ ...idle, matrices: 4, availableBytes: 2.4 * GiB }).concurrency, 3);
  // 1.0 GiB → 0 slots, still runs one
  assert.equal(pickConcurrency({ ...idle, matrices: 4, availableBytes: 1 * GiB }).concurrency, 1);
});

test('idle CPU limits it: one idle core a matrix', () => {
  assert.equal(pickConcurrency({ ...idle, matrices: 4, idleCores: 2.5 }).concurrency, 2);
  // no idle core → still one at a time
  assert.equal(pickConcurrency({ ...idle, matrices: 4, idleCores: 0.3 }).concurrency, 1);
});

test('idle cores are read from the per-core time counters, not the load average', async () => {
  // 4 cores; over the window each core spends 100 ticks, 3 of them 75 idle, 1 of them 0 idle
  let call = 0;
  const core = (user, idle) => ({ times: { user, nice: 0, sys: 0, irq: 0, idle } });
  const cpusFn = () => {
    call += 1;
    return call > 1
      ? [core(25, 75), core(25, 75), core(25, 75), core(100, 0)]
      : [core(0, 0), core(0, 0), core(0, 0), core(0, 0)];
  };
  assert.equal(await sampleIdleCores(cpusFn, 1), 2.25);
});

test('--concurrency wins over the machine but is still capped at 4 and at the matrix count', () => {
  const busy = { cpus: 12, idleCores: 0, availableBytes: 1 * GiB };
  assert.equal(pickConcurrency({ ...busy, matrices: 4, requested: 3 }).concurrency, 3);
  assert.equal(pickConcurrency({ ...busy, matrices: 8, requested: 6 }).concurrency, 4);
  assert.equal(pickConcurrency({ ...busy, matrices: 2, requested: 4 }).concurrency, 2);
});

test('the reason names the numbers it decided from', () => {
  const { reason } = pickConcurrency({ cpus: 12, idleCores: 2.5, availableBytes: 2.4 * GiB, matrices: 4 });
  assert.match(reason, /2\.4 GiB 够 3 份/);
  assert.match(reason, /空闲 CPU 2\.5 核.*够 2 份/);
});
