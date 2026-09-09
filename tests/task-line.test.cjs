const assert = require('node:assert/strict');
const { TaskLine, normalizeTimeStr } = require('../.test-dist/task-line.cjs');

assert.equal(normalizeTimeStr('930'), '09:30');
assert.equal(normalizeTimeStr('0930'), '09:30');
assert.equal(normalizeTimeStr('9:30'), '09:30');

const plain = TaskLine.parse('- [ ] Write report');
assert.ok(plain);
assert.equal(plain.title, 'Write report');
assert.equal(plain.toString(), '- [ ] Write report');

const running = TaskLine.parse('- [/] Write report 【09:30-】');
assert.ok(running);
assert.equal(running.actualStart, '09:30');
assert.equal(running.actualEnd, '');
assert.equal(running.toString(), '- [/] Write report 【09:30-】');

const done = TaskLine.parse('- [x] Write report 【23:50-00:10】');
assert.ok(done);
assert.equal(done.toString(), '- [x] Write report 【23:50-00:10 / 20m】');

const explicitElapsed = TaskLine.parse('- [x] Write report 【09:00-09:25 / 25m】');
assert.ok(explicitElapsed);
assert.equal(explicitElapsed.actualMin, '25');
assert.equal(explicitElapsed.toString(), '- [x] Write report 【09:00-09:25 / 25m】');

const skipped = TaskLine.parse('- [>] Later [SKIP 2026]');
assert.ok(skipped);
assert.equal(skipped.skippedAt, '2026');
assert.equal(skipped.toString(), '- [<] Later [SKIP 2026]');

assert.equal(TaskLine.parse('not a task'), null);
console.log('TaskLine regression tests passed');
