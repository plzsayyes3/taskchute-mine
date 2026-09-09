export function normalizeTimeStr(t) {
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
