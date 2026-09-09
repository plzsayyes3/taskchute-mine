const assert = require('node:assert/strict');
const {
  normalizeTechoHeader,
  extractTechoItemsForDate,
  applyTechoImportToLog,
} = require('../.test-dist/techo.cjs');

assert.equal(normalizeTechoHeader('techoからインポート'), '## techoからインポート');
assert.equal(normalizeTechoHeader('### Imported'), '### Imported');
assert.equal(normalizeTechoHeader(''), '## techoからインポート');

const month = [
  '# 2026年9月',
  '',
  '## 09月09日(水)',
  '- [ ] 朝の項目',
  '- [ ] 夜の項目',
  '',
  '## 9月10日(木)',
  '- [ ] 翌日の項目',
].join('\n');

assert.deepEqual(
  extractTechoItemsForDate(month, '2026-09-09'),
  ['- [ ] 朝の項目', '- [ ] 夜の項目']
);
assert.deepEqual(extractTechoItemsForDate(month, '2026-09-11'), []);

const appendedToEnd = applyTechoImportToLog(
  '# 2026-09-09\n\n- [ ] existing',
  '## techoからインポート',
  ['- [ ] A', '- [ ] B'],
  'append'
);
assert.equal(appendedToEnd.addedCount, 2);
assert.equal(
  appendedToEnd.content,
  '# 2026-09-09\n\n- [ ] existing\n\n## techoからインポート\n- [ ] A\n- [ ] B'
);

const appendDedup = applyTechoImportToLog(
  '# Day\n## techoからインポート\n- [ ] A\n## Next\ntext',
  '## techoからインポート',
  ['- [ ] A', '- [ ] B'],
  'append'
);
assert.equal(appendDedup.addedCount, 1);
assert.equal(
  appendDedup.content,
  '# Day\n## techoからインポート\n- [ ] A\n- [ ] B\n## Next\ntext'
);

const replaced = applyTechoImportToLog(
  '# Day\n## techoからインポート\n- [ ] old\n## Next\ntext',
  '## techoからインポート',
  ['- [ ] new'],
  'replace'
);
assert.equal(replaced.addedCount, 1);
assert.equal(
  replaced.content,
  '# Day\n## techoからインポート\n- [ ] new\n## Next\ntext'
);

console.log('Techo regression tests passed');
