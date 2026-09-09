from pathlib import Path

main_path = Path('src/main.ts')
main = main_path.read_text()
anchor = "import { buildDashboardPanelExtension } from './ui/dashboard-panel';\n"
imports = (
    "import { TaskChuteCalendarView } from './ui/task-chute-calendar-view';\n"
    "import { TaskChuteScrollView } from './ui/task-chute-scroll-view';\n"
)
if imports not in main:
    if anchor not in main:
        raise SystemExit('main import anchor not found')
    main = main.replace(anchor, anchor + imports, 1)
main_path.write_text(main)

styles_path = Path('styles.css')
styles = styles_path.read_text()
recovered = Path('scripts/recovered-view-styles.css').read_text()
marker = 'Calendar View — recovered from catch-all-notebook 2026-03-27'
if marker not in styles:
    styles = styles.rstrip() + '\n\n' + recovered.strip() + '\n'
styles_path.write_text(styles)
