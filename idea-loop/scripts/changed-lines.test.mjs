import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLines, locate, filterDiagnostics } from './changed-lines.mjs';

const diff = `diff --git a/app/src/player.ts b/app/src/player.ts
--- a/app/src/player.ts
+++ b/app/src/player.ts
@@ -10,0 +11,2 @@ export function play() {
+  const retry = 3;
+  let x = 1;
@@ -40 +42 @@ function stop() {
-  old();
+  next();
diff --git a/api/routes.py b/api/routes.py
new file mode 100644
--- /dev/null
+++ b/api/routes.py
@@ -0,0 +1,2 @@
+import os
+def handler(): pass
diff --git a/gone.ts b/gone.ts
--- a/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-x
`;

test('added and changed new-side lines are collected per file; deleted files are ignored', () => {
  const c = changedLines(diff);
  assert.deepEqual([...c.get('app/src/player.ts')], [11, 12, 42]);
  assert.deepEqual([...c.get('api/routes.py')], [1, 2]);
  assert.equal(c.has('gone.ts'), false);
});

test('common diagnostic formats are located', () => {
  assert.deepEqual(locate('api/routes.py:1:1: F401 `os` imported but unused'), { path: 'api/routes.py', line: 1 });
  assert.deepEqual(locate('src/player.ts(12,7): error TS6133: x is declared but never read.'), { path: 'src/player.ts', line: 12 });
  assert.deepEqual(locate('/abs/repo/app/src/player.ts:42:3: Unexpected call [Error/no-restricted]'), { path: '/abs/repo/app/src/player.ts', line: 42 });
  assert.equal(locate('Found 3 errors.'), null);
});

test('only diagnostics on changed lines survive; the rest is counted, not dropped silently', () => {
  const output = [
    'api/routes.py:1:1: F401 `os` imported but unused', // changed
    'src/player.ts(12,7): error TS6133: x is declared but never read.', // changed, path relative to a sub-project
    'app/src/player.ts:5:1: old debt', // same file, unchanged line
    'lib/other.ts:3:1: elsewhere', // untouched file
    'Found 4 errors.',
  ].join('\n');
  const r = filterDiagnostics(output, changedLines(diff));
  assert.equal(r.onChanged.length, 2);
  assert.equal(r.elsewhere, 2);
  assert.equal(r.unlocated, 1);
});
