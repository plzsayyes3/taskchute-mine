export function registerCheckboxClickHook(this: any) {
    let _checkboxLongPressTimer = null;
    let _checkboxPointerDownAtMs = null;
    let _suppressNextCheckboxClick = false;
    const _checkboxLongPressMsTouch = 450;
    const _checkboxLongPressMsDesktop = 900;

    const _getCheckboxEl = (ev) => {
        const target = ev.target;
        if (!target) return null;
        const isCheckbox = target.type === 'checkbox' ||
            target.classList?.contains('task-list-item-checkbox');
        if (!isCheckbox) return null;
        if (!target.closest('.markdown-source-view')) return null;
        return target;
    };

    const _getEditorAndLine = (checkboxEl) => {
        if (!checkboxEl) return null;
        const activeEditor = this.app.workspace.activeEditor;
        if (!activeEditor?.editor) return null;
        const editor = activeEditor.editor;
        const view = editor.cm;
        if (!view) return null;
        const pos = view.posAtDOM(checkboxEl);
        if (pos === null) return null;
        const line = view.state.doc.lineAt(pos);
        return { editor, lineIndex: line.number - 1 };
    };

    this.registerDomEvent(document, 'pointerdown', (ev) => {
        if (!this.settings.enableCheckboxClickHook) return;
        const checkboxEl = _getCheckboxEl(ev);
        if (!checkboxEl) return;
        _checkboxPointerDownAtMs = Date.now();
        const threshold = ev.pointerType === 'touch' ? _checkboxLongPressMsTouch : _checkboxLongPressMsDesktop;
        if (_checkboxLongPressTimer) clearTimeout(_checkboxLongPressTimer);
        _checkboxLongPressTimer = setTimeout(() => {
            _checkboxLongPressTimer = null;
            _suppressNextCheckboxClick = true;
            const info = _getEditorAndLine(checkboxEl);
            if (!info) return;
            this._handleCheckboxLongPress(info.editor, info.lineIndex);
        }, threshold);
    });

    this.registerDomEvent(document, 'pointerup', () => {
        if (_checkboxLongPressTimer) {
            clearTimeout(_checkboxLongPressTimer);
            _checkboxLongPressTimer = null;
        }
        _checkboxPointerDownAtMs = null;
    });

    this.registerDomEvent(document, 'pointercancel', () => {
        if (_checkboxLongPressTimer) {
            clearTimeout(_checkboxLongPressTimer);
            _checkboxLongPressTimer = null;
        }
        _suppressNextCheckboxClick = false;
        _checkboxPointerDownAtMs = null;
    });

    this.registerDomEvent(document, 'click', (ev) => {
        if (!this.settings.enableCheckboxClickHook) return;
        if (_suppressNextCheckboxClick) {
            _suppressNextCheckboxClick = false;
            ev.preventDefault();
            ev.stopPropagation();
            return;
        }
        const checkboxEl = _getCheckboxEl(ev);
        if (!checkboxEl) return;
        ev.preventDefault();
        ev.stopPropagation();
        const info = _getEditorAndLine(checkboxEl);
        if (!info) return;
        this._handleCheckboxShortPress(info.editor, info.lineIndex);
    }, true);
}
