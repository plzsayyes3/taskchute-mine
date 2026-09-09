from pathlib import Path
import json

main_path = Path('src/main.ts')
text = main_path.read_text(encoding='utf-8')

start_marker = 'function normalizeTimeStr(t) {'
end_marker = '\nclass TaskTextModal extends Modal {'
start = text.find(start_marker)
end = text.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise SystemExit('TaskLine source markers not found; refusing to modify src/main.ts')

module = r'''export function normalizeTimeStr(t) {
    if (!t) return t;
    // HHmm or Hmm compact format (no colon) → HH:mm
    if (/^\d{3,4}$/.test(t)) {
        const padded = t.padStart(4, '0');
        return `${padded.slice(0, 2)}:${padded.slice(2)}`;
    }
    // H:mm or HH:mm (already has colon) → normalize to HH:mm
    const colonMatch = t.match(/^(\d{1,2}):(\d{2})$/);
    if (colonMatch) {
        return `${colonMatch[1].padStart(2, '0')}:${colonMatch[2]}`;
    }
    return t;
}

export class TaskLine {
    originalText: string;
    indent: string;
    bullet: string;
    isChecked: boolean;
    actualStart: string;
    actualEnd: string;
    planStart: string;
    planEnd: string;
    title: string;
    estimate: string;
    actualMin: string;
    skippedAt: string;
    isDeferred: boolean;

    constructor() {
        this.originalText = "";
        this.indent = "";
        this.bullet = "";
        this.isChecked = false;
        this.isDeferred = false;
        this.actualStart = "";
        this.actualEnd = "";
        this.planStart = "";
        this.planEnd = "";
        this.title = "";
        this.estimate = "";
        this.actualMin = "";
        this.skippedAt = "";
    }

    static parse(line) {
        const tl = new TaskLine();
        tl.originalText = line;

        // allow any single character inside checkbox brackets, such as [/] [-] [>]
        const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(\[[^\]]\]\s+)?/);
        let remain = line;

        if (bulletMatch) {
            tl.indent = bulletMatch[1];
            tl.bullet = bulletMatch[0].substring(tl.indent.length);
            if (bulletMatch[3]) {
                const checkboxChunk = bulletMatch[3];
                // only 'x' or 'X' counts as completed strictly by checkbox
                tl.isChecked = /\[[xX]\]/.test(checkboxChunk);
                tl.isDeferred = /\[>\]/.test(checkboxChunk);
            } else {
                tl.isChecked = false;
                tl.isDeferred = false;
            }
            remain = remain.substring(bulletMatch[0].length);
        } else {
            return null;
        }

        const statusMatch = remain.match(/^(✔️|▶️|✅|⬜️|🏃)[\s　]*/);
        if (statusMatch) {
            remain = remain.substring(statusMatch[0].length);
        }

        const skipMatch = remain.match(/\s*\[SKIP(?:\s+(\d{4}))?\]\s*$/i);
        if (skipMatch) {
            tl.skippedAt = skipMatch[1] || "";
            remain = remain.substring(0, remain.length - skipMatch[0].length).trimEnd();
        }

        // Parse postfix time block: 【HH:MM-HH:MM / XXm】 or 【HH:MM-】
        const postfixTimeMatch = remain.match(/[\s　]*【\s*(\d{1,2}:\d{2})?[\s　]*[-－ー][\s　]*(\d{1,2}:\d{2})?[\s　]*(?:\/[\s　]*(\d+)m)?[\s　]*】\s*$/);
        if (postfixTimeMatch) {
            tl.actualStart = postfixTimeMatch[1] || "";
            tl.actualEnd = postfixTimeMatch[2] || "";
            if (postfixTimeMatch[3]) {
                tl.actualMin = postfixTimeMatch[3];
            }
            remain = remain.substring(0, remain.length - postfixTimeMatch[0].length).trimEnd();
        }

        tl.title = remain.replace(/^[\s　]+/, '').trim();

        return tl;
    }

    toString() {
        const aS = normalizeTimeStr(this.actualStart);
        const aE = normalizeTimeStr(this.actualEnd);

        let titleStr = this.title;
        let timeBlockStr = "";

        // Build postfix time block: 【HH:MM-HH:MM / XXm】 or 【HH:MM-】
        if (aS || aE) {
            const startPart = aS || "";
            const endPart = aE || "";
            let elapsedPart = "";

            if (this.skippedAt) {
                // skipped tasks should not calculate elapsed time
            } else if (this.actualMin) {
                elapsedPart = ` / ${this.actualMin}m`;
            } else if (aS && aE) {
                // Calculate minutes on the fly if it has start, end, and is finished
                const sH = parseInt(aS.substring(0, 2), 10);
                const sM = parseInt(aS.substring(aS.length - 2), 10);
                const eH = parseInt(aE.substring(0, 2), 10);
                const eM = parseInt(aE.substring(aE.length - 2), 10);

                if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
                    let sMin = sH * 60 + sM;
                    let eMin = eH * 60 + eM;
                    let diff = eMin - sMin;
                    if (diff < 0) diff += 24 * 60;
                    elapsedPart = ` / ${diff}m`;
                }
            }

            timeBlockStr = ` 【${startPart}-${endPart}${elapsedPart}】`;
        }

        let contentObj = titleStr + timeBlockStr;

        // Checkbox bullet correction
        if (this.actualStart && this.actualEnd) {
            this.bullet = this.bullet.replace(/\[.*\]/, '[x]');
        } else if (this.actualStart) {
            this.bullet = this.bullet.replace(/\[.*\]/, '[/]');
        } else if (this.isDeferred) {
            this.bullet = this.bullet.replace(/\[.*\]/, '[<]');
        }

        if (this.skippedAt) {
            contentObj += ` [SKIP ${this.skippedAt}]`;
        }

        return this.indent + this.bullet + contentObj;
    }
}
'''

Path('src/core').mkdir(parents=True, exist_ok=True)
Path('src/core/task-line.ts').write_text(module, encoding='utf-8')

replacement = "import { TaskLine, normalizeTimeStr } from './core/task-line';\n\n" + text[:start] + text[end+1:]
main_path.write_text(replacement, encoding='utf-8')

Path('tests').mkdir(exist_ok=True)
Path('tests/task-line.test.cjs').write_text(r'''const assert = require('node:assert/strict');
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
''', encoding='utf-8')

package_path = Path('package.json')
pkg = json.loads(package_path.read_text(encoding='utf-8'))
pkg.setdefault('scripts', {})['test:task-line'] = "rm -rf .test-dist && esbuild src/core/task-line.ts --bundle --platform=node --format=cjs --outfile=.test-dist/task-line.cjs && node tests/task-line.test.cjs && rm -rf .test-dist"
package_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

ignore_path = Path('.gitignore')
ignore = ignore_path.read_text(encoding='utf-8') if ignore_path.exists() else ''
if '.test-dist/' not in ignore:
    ignore += ('' if ignore.endswith('\n') or not ignore else '\n') + '.test-dist/\n'
ignore_path.write_text(ignore, encoding='utf-8')
