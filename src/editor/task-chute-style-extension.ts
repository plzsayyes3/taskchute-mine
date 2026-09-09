import { Decoration, ViewPlugin } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { TaskLine } from '../core/task-line';

const taskChuteStylePlugin = ViewPlugin.fromClass(class {
    decorations: any;

    constructor(view) {
        this.decorations = this.buildDecorations(view);
    }

    update(update) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const doc = view.state.doc;
        
        let lastParentDone = false;
        
        for (let { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                const line = doc.lineAt(pos);
                const lineObj = TaskLine.parse(line.text);
                
                if (lineObj) {
                    // It's a task line (has bullet)
                    const isChild = lineObj.indent.length > 0;
                    
                    if (!isChild) {
                        // It's a parent task
                        lastParentDone = !!(lineObj.isChecked || lineObj.skippedAt || (lineObj.actualStart && lineObj.actualEnd));
                        
                        const isRunning = !!(lineObj.actualStart && !lineObj.actualEnd && !lineObj.isChecked && !lineObj.skippedAt);
                        if (isRunning) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-running'
                            }));
                        } else if (lastParentDone) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-done'
                            }));
                        }
                    } else {
                        // It's a child task / memo line
                        if (lastParentDone) {
                            builder.add(line.from, line.from, Decoration.line({
                                class: 'taskchute-line-done'
                            }));
                        }
                    }
                } else {
                    // Not a task line (e.g. empty line, header)
                    // We might want to reset parent tracking if it's a header or large break
                    if (line.text.startsWith('#')) {
                        lastParentDone = false;
                    }
                }
                pos = line.to + 1;
            }
        }
        return builder.finish();
    }
}, {
    decorations: v => v.decorations
});

export const taskChuteStyleExtension = [taskChuteStylePlugin];
