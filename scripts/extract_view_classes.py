from pathlib import Path

path = Path('src/main.ts')
text = path.read_text()

for needle in ('TaskChuteCalendarView', 'TaskChuteScrollView'):
    print(f'=== {needle} occurrences ===')
    found = False
    for i, line in enumerate(text.splitlines(), start=1):
        if needle in line:
            found = True
            print(f'{i}: {line}')
    if not found:
        print('(none)')

raise SystemExit('diagnostic only')
