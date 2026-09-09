export interface TechoImportResult {
    content: string;
    addedCount: number;
}

export function normalizeTechoHeader(header: unknown): string {
    const trimmed = String(header || '').trim();
    if (!trimmed) return '## techoからインポート';
    if (/^#{1,6}\s+/.test(trimmed)) return trimmed;
    return `## ${trimmed}`;
}

export function extractTechoItemsForDate(content: unknown, dateStr: string): string[] {
    if (!content || !dateStr) return [];
    const parts = dateStr.split('-');
    if (parts.length !== 3) return [];
    const monthNum = parseInt(parts[1], 10);
    const dayNum = parseInt(parts[2], 10);
    // Supports both "03月17日" and "3月17日"
    const headerRe = new RegExp(`^##\\s*0?${monthNum}月0?${dayNum}日(?:\\([^)]*\\))?\\s*$`);
    const lines = String(content).split(/\r?\n/);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        if (headerRe.test(lines[i].trim())) {
            start = i;
            break;
        }
    }
    if (start === -1) return [];

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i].trim())) {
            end = i;
            break;
        }
    }

    const items: string[] = [];
    for (let i = start + 1; i < end; i++) {
        const trimmed = String(lines[i] || '').trim();
        if (!trimmed) continue;
        if (/^#{1,6}\s+/.test(trimmed)) continue;
        items.push(trimmed);
    }
    return items;
}

export function applyTechoImportToLog(
    content: unknown,
    header: string,
    items: string[],
    mode: string
): TechoImportResult {
    const lines = String(content || '').split(/\r?\n/);
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === header) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        const nextLines = [...lines];
        if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== '') {
            nextLines.push('');
        }
        nextLines.push(header, ...items);
        return { content: nextLines.join('\n'), addedCount: items.length };
    }

    let blockEnd = lines.length;
    for (let i = headerIndex + 1; i < lines.length; i++) {
        if (/^#{1,6}\s+/.test(lines[i].trim())) {
            blockEnd = i;
            break;
        }
    }

    if (mode === 'replace') {
        const replaced = [...lines.slice(0, headerIndex + 1), ...items, ...lines.slice(blockEnd)];
        return { content: replaced.join('\n'), addedCount: items.length };
    }

    const existing = new Set<string>();
    for (let i = headerIndex + 1; i < blockEnd; i++) {
        existing.add(lines[i].trim());
    }
    const toAppend = items.filter(item => !existing.has(item.trim()));
    const appended = [...lines.slice(0, blockEnd), ...toAppend, ...lines.slice(blockEnd)];
    return { content: appended.join('\n'), addedCount: toAppend.length };
}
