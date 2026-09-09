const assert = require('node:assert/strict');
const {
  normalizeTaskTitle,
  isInvalidSuggestTitle,
  isTaskExecutionRecord,
  upsertHistoryIndexEntry,
  normalizeHistoryEntries,
} = require('../.test-dist/history.cjs');

assert.equal(normalizeTaskTitle('  Write   report  '), 'Write report');
assert.equal(isInvalidSuggestTitle(''), true);
assert.equal(isInvalidSuggestTitle('+30m'), true);
assert.equal(isInvalidSuggestTitle('09:00-10:00'), true);
assert.equal(isInvalidSuggestTitle('Write report'), false);

const executed = {
  title: 'Write report', estimate: '', actualStart: '09:00', actualEnd: '09:20',
  skippedAt: '', isChecked: true,
};
assert.equal(isTaskExecutionRecord(executed), true);
const pending = {
  title: 'Write report', estimate: '', actualStart: '', actualEnd: '',
  skippedAt: '', isChecked: false,
};
assert.equal(isTaskExecutionRecord(pending), false);

const index = {};
upsertHistoryIndexEntry(index, executed, '2026-09-09 09:20');
assert.equal(index['write report'].count, 1);
assert.equal(index['write report'].lastUsedAt, '2026-09-09 09:20');

const older = {
  ...executed,
  estimate: '30',
  actualStart: '08:00',
  actualEnd: '08:10',
};
upsertHistoryIndexEntry(index, older, '2026-09-08 08:10');
assert.equal(index['write report'].count, 2);
assert.equal(index['write report'].estimate, '30');
assert.equal(index['write report'].lastUsedAt, '2026-09-09 09:20');

const normalized = normalizeHistoryEntries({
  'write report': { title: 'Write report', estimate: '25', count: 2, lastUsedAt: '2026-09-09 09:20' },
  'Read book': '15',
  '+30m': 5,
});
assert.equal(normalized.rawCount, 3);
assert.equal(normalized.dropped, 1);
assert.deepEqual(normalized.entries.map((x) => x.title), ['Write report', 'Read book']);
assert.equal(normalized.entries[0].count, 2);
assert.equal(normalized.entries[1].estimate, '15');

console.log('History regression tests passed');
