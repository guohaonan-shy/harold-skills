import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  regionBox, diffAnchors, parseChangeSet, classifyChanges, shotFileName, renderCanvasDiff, hasAttention,
} from './ui-canvas-diff.mjs';

const box = (over = {}) => ({ top: 100, left: 40, width: 320, height: 48, color: 'rgb(0, 0, 0)', ...over });
const page = { width: 1440, height: 900 };

// ---------- region box (what the anchor-area screenshot is cut from) ----------

test('a region box is the anchor rectangle in whole pixels, the same for both sides', () => {
  const rect = { top: 100.4, left: 40, width: 320, height: 48.2 };
  assert.deepEqual(regionBox(rect, rect, page, page), { x: 40, y: 100, width: 320, height: 49 });
});

test('when the anchor grew between the two versions the region covers both rectangles, so both crops have one size', () => {
  const before = { top: 100, left: 40, width: 320, height: 48 };
  const after = { top: 100, left: 40, width: 320, height: 120 };
  assert.deepEqual(regionBox(before, after, page, page), { x: 40, y: 100, width: 320, height: 120 });
});

test('a region is cut down to the area both pages actually have, and is null when nothing of it is left', () => {
  const low = { top: 800, left: 0, width: 100, height: 200 };
  assert.deepEqual(regionBox(low, low, page, { width: 1440, height: 1000 }), { x: 0, y: 800, width: 100, height: 100 });
  const beyond = { top: 950, left: 0, width: 100, height: 20 };
  assert.equal(regionBox(beyond, beyond, page, page), null);
});

test('an anchor that is hidden (no area) on both sides has no region', () => {
  const none = { top: 0, left: 0, width: 0, height: 0 };
  assert.equal(regionBox(none, none, page, page), null);
});

test('an anchor present on one side only still gets a region, from the side that has it', () => {
  const r = regionBox(undefined, { top: 10, left: 10, width: 50, height: 20 }, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert.deepEqual(r, { x: 10, y: 10, width: 50, height: 20 });
});

// ---------- which anchors changed ----------

test('two identical versions have no changed anchors', () => {
  const m = { hero: box(), cta: box({ top: 300 }) };
  assert.deepEqual(diffAnchors(m, structuredClone(m)), []);
});

test('a changed style is reported with the property and both values', () => {
  const before = { hero: box(), cta: box({ top: 300 }) };
  const after = { hero: box(), cta: box({ top: 300, color: 'rgb(255, 0, 0)' }) };
  const changed = diffAnchors(before, after);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].anchor, 'cta');
  assert.equal(changed[0].kind, 'changed');
  assert.deepEqual(changed[0].changes, [{ property: 'color', before: 'rgb(0, 0, 0)', after: 'rgb(255, 0, 0)', delta: null }]);
});

test('a size change inside the position tolerance is not a change, one beyond it is', () => {
  const before = { card: box() };
  assert.deepEqual(diffAnchors(before, { card: box({ height: 49 }) }), []);
  const changed = diffAnchors(before, { card: box({ height: 120 }) });
  assert.equal(changed[0].changes[0].property, 'height');
  assert.equal(changed[0].changes[0].delta, 72);
});

test('an anchor only in the new version is "added", only in the old one is "removed"', () => {
  const changed = diffAnchors({ gone: box(), kept: box() }, { kept: box(), toggle: box() });
  assert.deepEqual(changed.map((c) => [c.anchor, c.kind]).sort(), [['gone', 'removed'], ['toggle', 'added']]);
});

// ---------- the change set ----------

test('a change set entry names a decision, the states and the anchors it touched', () => {
  const set = parseChangeSet([{ decision: '2.1', states: ['default'], anchors: ['card', 'card-title'] }]);
  assert.deepEqual(set, [{ decision: '2.1', states: ['default'], anchors: ['card', 'card-title'] }]);
  assert.deepEqual(parseChangeSet([]), []);
});

test('a malformed change set is refused with the entry named', () => {
  assert.throws(() => parseChangeSet({}), /数组/);
  assert.throws(() => parseChangeSet([{ decision: 'two', states: ['a'], anchors: ['b'] }]), /decision/);
  assert.throws(() => parseChangeSet([{ decision: '2.1', states: [], anchors: ['b'] }]), /states/);
  assert.throws(() => parseChangeSet([{ decision: '2.1', states: ['a'] }]), /anchors/);
});

const change = (state, anchor, extra = {}) => ({ cell: `desktop/${state}`, state, anchor, kind: 'changed', changes: [], pixelPercent: null, ...extra });

test('a change nobody declared is found; a declared one is not reported as undeclared', () => {
  const changes = [change('default', 'card'), change('default', 'card-toggle')];
  const set = [{ decision: '2.1', states: ['default'], anchors: ['card'] }];
  const r = classifyChanges(changes, set, ['default']);
  assert.deepEqual(r.undeclared.map((c) => c.anchor), ['card-toggle']);
  assert.deepEqual(r.declared.map((c) => [c.anchor, c.decisions]), [['card', ['2.1']]]);
});

test('declaring an anchor for another state does not cover a change in this state', () => {
  const changes = [change('empty', 'card')];
  const set = [{ decision: '2.1', states: ['default'], anchors: ['card'] }];
  const r = classifyChanges(changes, set, ['default', 'empty']);
  assert.deepEqual(r.undeclared.map((c) => c.state), ['empty']);
});

test('a declaration that matches nothing that changed is listed, for the states that were compared', () => {
  const changes = [change('default', 'card')];
  const set = [{ decision: '2.1', states: ['default', 'empty'], anchors: ['card', 'title'] }];
  const r = classifyChanges(changes, set, ['default', 'empty']);
  const pairs = r.declaredUnchanged.map((d) => `${d.decision}|${d.state}|${d.anchor}`).sort();
  assert.deepEqual(pairs, ['2.1|default|title', '2.1|empty|card', '2.1|empty|title']);
});

test('a declaration for a state no cell compared is reported as unchecked, not as unchanged', () => {
  const r = classifyChanges([], [{ decision: '2.1', states: ['mobile-empty'], anchors: ['card'] }], ['default']);
  assert.deepEqual(r.declaredUnchanged, []);
  assert.deepEqual(r.unchecked, [{ decision: '2.1', state: 'mobile-empty' }]);
});

test('with an empty change set (round one) every change is undeclared', () => {
  const r = classifyChanges([change('default', 'card')], [], ['default']);
  assert.equal(r.undeclared.length, 1);
  assert.equal(r.declared.length, 0);
});

test('one change covered by two decisions carries both numbers', () => {
  const set = [
    { decision: '2.1', states: ['default'], anchors: ['card'] },
    { decision: '2.3', states: ['default'], anchors: ['card'] },
  ];
  const r = classifyChanges([change('default', 'card')], set, ['default']);
  assert.deepEqual(r.declared[0].decisions, ['2.1', '2.3']);
});

// ---------- output ----------

test('shot file names are safe and say cell, anchor and side', () => {
  assert.equal(shotFileName('desktop/light/default', 'card-title', 'before'), 'desktop-light-default--card-title--before.png');
  assert.equal(shotFileName('a b', 'x/y', 'after'), 'a-b--x-y--after.png');
});

test('attention: undeclared changes need a look; with no change set any change does; declared ones alone do not', () => {
  const c = change('d', 'a');
  assert.equal(hasAttention({ changed: [], undeclared: [] }, true), false);
  assert.equal(hasAttention({ changed: [c], undeclared: [] }, true), false);
  assert.equal(hasAttention({ changed: [c], undeclared: [c] }, true), true);
  assert.equal(hasAttention({ changed: [c], undeclared: [] }, false), true);
});

test('the human-readable render puts the undeclared block first and says plainly when nothing changed', () => {
  const c = change('default', 'card-toggle', { changes: [{ property: 'height', before: 48, after: 120, delta: 72 }] });
  const none = { changed: [], undeclared: [], declared: [], declaredUnchanged: [], unchecked: [] };
  const text = renderCanvasDiff({ ...none, changed: [c], undeclared: [c] }, true);
  assert.match(text, /没声明/);
  assert.match(text, /card-toggle/);
  assert.match(text, /height/);
  assert.match(renderCanvasDiff(none, true), /没有变/);
});
