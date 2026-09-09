const assert = require('node:assert/strict');
const { TaskLine } = require('../.test-dist/history-suggest.cjs');
const { HistorySuggestService } = require('../.test-dist/history-suggest.cjs');

const service = new HistorySuggestService();

const base = TaskLine.parse('  - [ ] Existing');
const line = service.buildTaskLineFromHistoryEntry(
  { title: 'Past task', estimate: '25', count: 3, lastUsedAt: '2026-09-09 10:00' },
  base
);
assert.equal(line, '  - [ ] Past task 25m');

function makeEditor(lines) {
  const state = { lines: [...lines], cursor: null };
  return {
    state,
    lineCount: () => state.lines.length,
    getLine: (i) => state.lines[i],
    setValue: (text) => { state.lines = text.split('\n'); },
    setCursor: (pos) => { state.cursor = pos; },
    replaceRange: (text, from) => {
      const before = state.lines.slice(0, from.line);
      const after = state.lines.slice(from.line);
      if (from.ch === 0 && text.endsWith('\n')) {
        state.lines = [...before, text.slice(0, -1), ...after];
        return;
      }
      if (from.line === state.lines.length - 1 && from.ch === state.lines[from.line].length && text.startsWith('\n')) {
        state.lines.push(text.slice(1));
        return;
      }
      if (state.lines[from.line] === '' && from.ch === 0) {
        state.lines[from.line] = text;
        return;
      }
      throw new Error(`Unhandled replaceRange fixture: ${JSON.stringify({text, from})}`);
    },
  };
}

const middle = makeEditor(['A', 'B', 'C']);
service.insertTaskLineBelow(middle, 0, 'X');
assert.deepEqual(middle.state.lines, ['A', 'X', 'B', 'C']);
assert.deepEqual(middle.state.cursor, { line: 1, ch: 1 });

const end = makeEditor(['A', 'B']);
service.insertTaskLineBelow(end, 1, 'X');
assert.deepEqual(end.state.lines, ['A', 'B', 'X']);
assert.deepEqual(end.state.cursor, { line: 2, ch: 1 });

const blankEnd = makeEditor(['A', '']);
service.insertTaskLineBelow(blankEnd, 1, 'X');
assert.deepEqual(blankEnd.state.lines, ['A', 'X']);
assert.deepEqual(blankEnd.state.cursor, { line: 1, ch: 1 });

console.log('History suggest regression tests passed');
