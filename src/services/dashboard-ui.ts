import { moment, Notice, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings';
import { TaskLine } from '../core/task-line';

export class DashboardUiService {
    constructor(private readonly host: any) {}

    isLogFilePath(filePath) {
            const plugin = this.host;
            if (!filePath) return false;
            const folder = plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
            return filePath.startsWith(folder + '/') && /\d{4}-\d{2}-\d{2}\.md$/.test(filePath);
        }

    computeDashboardData(text) {
            const plugin = this.host;
            const lines = text.split(/\r?\n/);
            let totalTasks = 0;
            let completedTasks = 0;
            let runningTask = null;
            let remainingEstimateMin = 0;
            let noEstimateCount = 0;
    
            // Detect current block (## section)
            const blockInfo = plugin.getCurrentBlockInfo(lines);
            let blockRemainingMin = 0;
            let inCurrentBlock = false;
            let currentSectionHeader = '';
    
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
    
                // Track section headers
                const sectionMatch = line.match(/^##\s+(\d+)-(\d+)/);
                if (sectionMatch) {
                    currentSectionHeader = line;
                    inCurrentBlock = blockInfo && blockInfo.headerLine === i;
                    continue;
                }
    
                const lineObj = TaskLine.parse(line);
                if (!lineObj) continue;
                if (lineObj.indent.length > 0) continue;
    
                totalTasks++;
    
                if (plugin.isCompletedLineObj(lineObj)) {
                    completedTasks++;
                } else if (plugin.isRunningLineObj(lineObj)) {
                    runningTask = {
                        title: lineObj.title,
                        estimate: lineObj.estimate,
                        actualStart: lineObj.actualStart
                    };
                    if (lineObj.estimate) {
                        const est = parseInt(lineObj.estimate, 10);
                        if (!isNaN(est) && lineObj.actualStart) {
                            const now = moment();
                            const startM = moment(lineObj.actualStart, 'HHmm');
                            if (startM.isValid()) {
                                const elapsed = now.diff(startM, 'minutes');
                                const remaining = Math.max(0, est - elapsed);
                                remainingEstimateMin += remaining;
                                if (inCurrentBlock) blockRemainingMin += remaining;
                            }
                        } else {
                            remainingEstimateMin += est;
                            if (inCurrentBlock) blockRemainingMin += est;
                        }
                    } else {
                        noEstimateCount++;
                    }
                } else {
                    // Startable / idle task
                    if (lineObj.estimate) {
                        const est = parseInt(lineObj.estimate, 10);
                        if (!isNaN(est)) {
                            remainingEstimateMin += est;
                            if (inCurrentBlock) blockRemainingMin += est;
                        }
                    } else {
                        noEstimateCount++;
                    }
                }
            }
    
            const now = moment();
            const estimatedEnd = remainingEstimateMin > 0
                ? now.clone().add(remainingEstimateMin, 'minutes').format('HH:mm')
                : now.format('HH:mm');
            
            const blockEstimatedEnd = blockRemainingMin > 0
                ? now.clone().add(blockRemainingMin, 'minutes').format('HH:mm')
                : now.format('HH:mm');
    
            return {
                totalTasks,
                completedTasks,
                runningTask,
                remainingEstimateMin,
                blockRemainingMin,
                blockName: blockInfo ? blockInfo.name : '',
                noEstimateCount,
                estimatedEnd,
                blockEstimatedEnd,
                currentTime: now.format('HH:mm')
            };
        }

    formatMinutes(min) {
            const plugin = this.host;
            const h = Math.floor(min / 60);
            const m = min % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }

    getCurrentBlockInfo(lines) {
            const plugin = this.host;
            const nowH = moment().hour();
            let lastHeader = null;
            let lastHeaderLine = -1;
    
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(/^##\s+(\d+)-(\d+)/);
                if (match) {
                    const startH = parseInt(match[1], 10);
                    const endH = parseInt(match[2], 10);
                    if (nowH >= startH && nowH < endH) {
                        return { name: `${match[1]}-${match[2]}`, startH, endH, headerLine: i };
                    }
                    lastHeader = { name: `${match[1]}-${match[2]}`, startH, endH, headerLine: i };
                    lastHeaderLine = i;
                }
            }
            return lastHeader;
        }

    async computeDailyNoteStats(dateStr) {
            const plugin = this.host;
            const folder = plugin.settings.dailyNoteFolderPath || DEFAULT_SETTINGS.dailyNoteFolderPath;
            const filePath = `${folder}/${dateStr}.md`;
            const file = plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file) return { h4Count: 0, charCount: 0, selfTwitterCount: 0 };
    
            try {
                const content = await plugin.app.vault.read(file);
                const lines = content.split(/\r?\n/);
    
                // H4 count
                const h4Count = lines.filter(l => /^####\s+/.test(l)).length;
    
                // Character count
                const charCount = content.length;
    
                // Self Twitter count
                const stHeader = plugin.settings.selfTwitterHeader || DEFAULT_SETTINGS.selfTwitterHeader;
                let selfTwitterCount = 0;
                let inSelfTwitter = false;
                for (const line of lines) {
                    if (line.trim() === stHeader.trim()) {
                        inSelfTwitter = true;
                        continue;
                    }
                    if (inSelfTwitter) {
                        // Stop at next heading of same or higher level
                        if (/^#{1,4}\s+/.test(line) && line.trim() !== stHeader.trim()) {
                            inSelfTwitter = false;
                            continue;
                        }
                        // Count top-level list items only (no indent)
                        if (/^-\s+/.test(line)) {
                            selfTwitterCount++;
                        }
                    }
                }
    
                return { h4Count, charCount, selfTwitterCount };
            } catch (e) {
                return { h4Count: 0, charCount: 0, selfTwitterCount: 0 };
            }
        }

    async fetchWeatherData() {
            const plugin = this.host;
            // Cache for 15 minutes
            const now = Date.now();
            if (plugin._weatherCache && (now - plugin._weatherCacheTime) < 15 * 60 * 1000) {
                return plugin._weatherCache;
            }
    
            try {
                const url = 'https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current=temperature_2m,weather_code,pressure_msl&timezone=Asia/Tokyo';
                const response = await fetch(url);
                const json = await response.json();
                const current = json.current || {};
                const result = {
                    temp: current.temperature_2m,
                    pressure: current.pressure_msl,
                    weatherCode: current.weather_code,
                    emoji: plugin.weatherCodeToEmoji(current.weather_code)
                };
                plugin._weatherCache = result;
                plugin._weatherCacheTime = now;
                return result;
            } catch (e) {
                return plugin._weatherCache || { temp: null, pressure: null, weatherCode: null, emoji: '—' };
            }
        }

    weatherCodeToEmoji(code) {
            const plugin = this.host;
            if (code == null) return '—';
            if (code === 0) return '☀️';
            if (code <= 3) return '⛅';
            if (code <= 48) return '🌫';
            if (code <= 67) return '🌧';
            if (code <= 77) return '❄';
            if (code <= 82) return '🌧';
            return '⛈';
        }

    buildDayProgressBar(width) {
            const plugin = this.host;
            const now = moment();
            const minutesElapsed = now.hour() * 60 + now.minute();
            const totalMinutes = 24 * 60;
            const filled = Math.round((minutesElapsed / totalMinutes) * width);
            const empty = width - filled;
            return '█'.repeat(filled) + '░'.repeat(empty);
        }

    buildWeekIndicator() {
            const plugin = this.host;
            // Monday=1, Sunday=7 (isoWeekday)
            const dayOfWeek = moment().isoWeekday(); // 1=Mon ... 7=Sun
            const dayNames = ['月', '火', '水', '木', '金', '土', '日'];
            let dots = '';
            for (let i = 1; i <= 7; i++) {
                dots += i <= dayOfWeek ? '●' : '○';
            }
            return { dots, dayName: dayNames[dayOfWeek - 1] };
        }

    formatRemainingTime(minutes) {
            const plugin = this.host;
            if (minutes <= 0) return '0m';
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            if (h > 0 && m > 0) return `${h}h${m}m`;
            if (h > 0) return `${h}h`;
            return `${m}m`;
        }

    async updateStatusBar() {
            const plugin = this.host;
            if (!plugin.statusBarEl) return;
            if (!plugin.settings.enableStatusBar) {
                plugin.statusBarEl.textContent = '';
                return;
            }
    
            // Read today's log file
            const folder = plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
            const todayStr = moment().format('YYYY-MM-DD');
            const filePath = `${folder}/${todayStr}.md`;
            const file = plugin.app.vault.getAbstractFileByPath(filePath);
            if (!file) {
                plugin.statusBarEl.textContent = '';
                return;
            }
    
            try {
                const content = await plugin.app.vault.read(file);
                const data = plugin.computeDashboardData(content);
    
                const parts = [];
                if (data.runningTask) {
                    const taskName = data.runningTask.title.length > 15
                        ? data.runningTask.title.substring(0, 15) + '…'
                        : data.runningTask.title;
                    parts.push(`▶ ${taskName}`);
                }
                parts.push(`✅ ${data.completedTasks}/${data.totalTasks}`);
                parts.push(`🏁 ${data.estimatedEnd}`);
                plugin.statusBarEl.textContent = parts.join('  |  ');
            } catch (e) {
                plugin.statusBarEl.textContent = '';
            }
        }

    initTopBar() {
            const plugin = this.host;
            if (plugin.topBarEl) return;
    
            plugin.topBarEl = document.createElement('div');
            plugin.topBarEl.className = 'tcl-topbar';
    
            // Build 4-line structure
            const line1 = document.createElement('div');
            line1.className = 'tcl-topbar-line1';
            const line2 = document.createElement('div');
            line2.className = 'tcl-topbar-line2';
            const line3 = document.createElement('div');
            line3.className = 'tcl-topbar-line3';
            const line4 = document.createElement('div');
            line4.className = 'tcl-topbar-line4';
            
            plugin.topBarEl.appendChild(line1);
            plugin.topBarEl.appendChild(line2);
            plugin.topBarEl.appendChild(line3);
            plugin.topBarEl.appendChild(line4);
    
            plugin.topBarLine1El = line1;
            plugin.topBarLine2El = line2;
            plugin.topBarLine3El = line3;
            plugin.topBarLine4El = line4;
    
            // Mobile toggle button (expand/collapse line2)
            if (plugin.app.isMobile) {
                plugin.topBarEl.classList.add('is-mobile');
                const toggle = document.createElement('div');
                toggle.className = 'tcl-topbar-toggle';
                toggle.innerHTML = '▲';
                plugin.topBarEl.appendChild(toggle);
                plugin.topBarToggleEl = toggle;
                plugin._topBarExpanded = true;
                plugin.topBarEl.classList.add('tcl-topbar-expanded');
    
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    plugin._topBarExpanded = !plugin._topBarExpanded;
                    if (plugin._topBarExpanded) {
                        plugin.topBarEl.classList.add('tcl-topbar-expanded');
                        toggle.innerHTML = '▲';
                    } else {
                        plugin.topBarEl.classList.remove('tcl-topbar-expanded');
                        toggle.innerHTML = '▼';
                    }
                });
            }
    
            // Apply mobile offset if any
            if (plugin.app.isMobile && plugin.settings.mobileTopBarOffset) {
                plugin.topBarEl.style.paddingTop = `${plugin.settings.mobileTopBarOffset}px`;
            }
    
            // Reload button (↻) - Far Right
            plugin.topBarReloadEl = document.createElement('div');
            plugin.topBarReloadEl.className = 'tcl-topbar-reload';
            plugin.topBarReloadEl.innerHTML = '↻';
            plugin.topBarReloadEl.title = '情報を更新';
            plugin.topBarEl.appendChild(plugin.topBarReloadEl);
            plugin.topBarReloadEl.addEventListener('click', (e) => {
                e.stopPropagation();
                plugin._weatherCache = null; 
                plugin.updateTopBar();
                plugin.topBarReloadEl.classList.add('is-spinning');
                setTimeout(() => plugin.topBarReloadEl.classList.remove('is-spinning'), 600);
            });
            plugin.topBarEl.addEventListener('click', () => {
                const folder = plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
                const todayStr = moment().format('YYYY-MM-DD');
                const filePath = `${folder}/${todayStr}.md`;
                plugin.app.workspace.openLinkText(filePath, '', true);
            });
    
            // Insert after title bar if exists, or at top of app-container
            const appEl = document.querySelector('.app-container');
            if (appEl) {
                const titlebar = appEl.querySelector('.titlebar');
                if (titlebar) {
                    // Insert after titlebar to avoid overlapping buttons
                    titlebar.after(plugin.topBarEl);
                } else {
                    appEl.insertBefore(plugin.topBarEl, appEl.firstChild);
                }
            } else {
                // Extreme fallback
                const workspaceEl = document.querySelector('.workspace');
                if (workspaceEl && workspaceEl.parentElement) {
                    workspaceEl.parentElement.insertBefore(plugin.topBarEl, workspaceEl);
                }
            }
    
            // Line 1 click → open taskchute log
            line1.addEventListener('click', (e) => {
                e.stopPropagation();
                plugin.openTodaysNote();
            });
    
            // Line 2 click → check if clicked on note-stats area, then open daily note
            line2.addEventListener('click', (e) => {
                e.stopPropagation();
                const target = e.target;
                if (target instanceof HTMLElement && target.closest('.tcl-tb-note-stats')) {
                    plugin.openTodaysDailyNote();
                } else {
                    plugin.openTodaysNote();
                }
            });
    
            // Mobile Line 4 click (stats row)
            line4.addEventListener('click', (e) => {
                e.stopPropagation();
                plugin.openTodaysDailyNote();
            });
    
            plugin.updateTopBar();
    
            // Auto-refresh every 30 seconds
            plugin.topBarIntervalId = window.setInterval(() => {
                plugin.updateTopBar();
            }, 30000);
    
            // Also update on leaf change
            plugin.registerEvent(
                plugin.app.workspace.on('active-leaf-change', () => {
                    plugin.updateTopBar();
                })
            );
        }

    async updateTopBar() {
            const plugin = this.host;
            if (!plugin.topBarEl) return;
    
            if (!plugin.settings.enableTopBar) {
                plugin.topBarEl.style.display = 'none';
                return;
            }
            plugin.topBarEl.style.display = '';
    
            // Apply mobile offset if any
            if (plugin.app.isMobile && plugin.settings.mobileTopBarOffset) {
                plugin.topBarEl.style.paddingTop = `${plugin.settings.mobileTopBarOffset}px`;
            } else {
                plugin.topBarEl.style.paddingTop = '';
            }
    
            const folder = plugin.settings.logFolderPath || DEFAULT_SETTINGS.logFolderPath;
            const todayStr = moment().format('YYYY-MM-DD');
            const filePath = `${folder}/${todayStr}.md`;
            const file = plugin.app.vault.getAbstractFileByPath(filePath);
    
            // Fetch weather (async, cached 15min)
            const weather = await plugin.fetchWeatherData();
    
            // Daily note stats
            const dailyStats = await plugin.computeDailyNoteStats(todayStr);
    
            // Progress bars
            const dayBar = plugin.buildDayProgressBar(20);
            const weekInfo = plugin.buildWeekIndicator();
            const nowTime = moment().format('HH:mm');
    
            if (!file) {
                // Line 1: time + no log + weather
                let weatherHtml = '';
                if (weather.temp != null) {
                    const pressureClass = weather.pressure < 1013 ? 'tcl-tb-pressure-low' : '';
                    weatherHtml = `<span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span><span class="tcl-tb-pressure ${pressureClass}">${Math.round(weather.pressure)}hPa</span>`;
                }
                let l1 = '';
                if (plugin.settings.showTopBarNav) {
                    l1 += `<span class="tcl-tb-nav"><span class="tcl-tb-nav-btn" id="tcl-tb-prev">◀</span><span class="tcl-tb-nav-btn" id="tcl-tb-today">今日</span><span class="tcl-tb-nav-btn" id="tcl-tb-next">▶</span></span>`;
                }
                l1 += `<span class="tcl-tb-time">${nowTime}</span><span class="tcl-tb-idle">ログなし</span><span class="tcl-tb-spacer"></span>${weatherHtml}`;
                plugin.topBarLine1El.innerHTML = l1;
                
                if (plugin.settings.showTopBarNav) {
                    plugin.topBarLine1El.querySelector('#tcl-tb-prev')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(-1); });
                    plugin.topBarLine1El.querySelector('#tcl-tb-today')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openTodaysNote(); });
                    plugin.topBarLine1El.querySelector('#tcl-tb-next')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(1); });
                }
    
                // Line 2: daily stats + progress bars
                plugin.topBarLine2El.innerHTML = `<span class="tcl-tb-note-stats">□${dailyStats.h4Count} ✎${dailyStats.charCount.toLocaleString()} 𝕏${dailyStats.selfTwitterCount}</span><span class="tcl-tb-spacer"></span><span class="tcl-tb-daybar">${dayBar}</span><span class="tcl-tb-daybar-label">${nowTime}/24h</span><span class="tcl-tb-weekdots">${weekInfo.dots}</span><span class="tcl-tb-weekday">${weekInfo.dayName}</span>`;
                return;
            }
    
            try {
                const content = await plugin.app.vault.read(file);
                const data = plugin.computeDashboardData(content);
    
                if (plugin.app.isMobile) {
                    // === REDESIGNED 4-ROW MOBILE LAYOUT (Reference Match) ===
                    
                    // Row 1: 3-column Grid (End Estimations | Time & Task | Weather)
                    let r1 = `<div class="tcl-mobile-grid-3">`;
                    
                    // Left Col: Day End & NoEst
                    r1 += `<div class="tcl-mobile-col left">
                        <span class="tcl-tb-remaining">🏁 ${data.estimatedEnd}</span>
                        <span class="tcl-tb-noest">!${data.noEstimateCount} 残り</span>
                    </div>`;
                    
                    // Center Col: Current Time & Task & Nav
                    let taskHtml = `<span class="tcl-tb-idle">待機中</span>`;
                    if (data.runningTask) {
                        taskHtml = `<span class="tcl-tb-running tcl-red-text">▶ ${data.runningTask.title.substring(0, 15)}</span>`;
                    }
                    r1 += `<div class="tcl-mobile-col center">`;
                    if (plugin.settings.showTopBarNav) {
                        r1 += `
                        <div class="tcl-tb-nav" style="margin-right:0; justify-content:center; margin-bottom: 2px;">
                            <span class="tcl-tb-nav-btn" id="tcl-tb-prev-m">◀</span>
                            <span class="tcl-tb-nav-btn" id="tcl-tb-today-m">今日</span>
                            <span class="tcl-tb-nav-btn" id="tcl-tb-next-m">▶</span>
                        </div>`;
                    }
                    r1 += `
                        <span class="tcl-tb-time" style="font-size: 1.25em; line-height: 1;">${data.currentTime}</span>
                        ${taskHtml}
                    </div>`;
                    
                    // Right Col: Pressure & Weather
                    let weatherHtml = 'n/a';
                    if (weather.temp != null) {
                        const pressureClass = weather.pressure < 1013 ? 'tcl-red-text' : '';
                        weatherHtml = `
                            <span class="tcl-tb-pressure ${pressureClass}" style="font-weight: 700;">${Math.round(weather.pressure)}hPa</span>
                            <span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span>
                        `;
                    }
                    r1 += `<div class="tcl-mobile-col right">${weatherHtml}</div>`;
                    r1 += `</div>`;
                    plugin.topBarLine1El.innerHTML = r1;
    
                    // Row 2: Thick Progress Bar with Text Overlay
                    const pct = Math.round((moment().hours() * 60 + moment().minutes()) / (24 * 60) * 100);
                    plugin.topBarLine2El.innerHTML = `
                        <div class="tcl-tb-daybar-container">
                            <div class="tcl-tb-daybar-fill" style="width: ${pct}%"></div>
                            <div class="tcl-tb-daybar-text">${data.currentTime} / 24h (${pct}%)</div>
                        </div>
                    `;
    
                    // Row 3: Buttons (Open Yesterday | Add Task Icon | Custom 1 | Custom 2)
                    plugin.topBarLine3El.innerHTML = `
                        <div class="tcl-mobile-btn-row">
                            <div class="tcl-mobile-btn" id="tcl-btn-yesterday" style="flex: 2;"><span>‹</span> 昨日を開く</div>
                            <div class="tcl-mobile-btn" id="tcl-btn-addtask" title="タスクを追記"></div>
                            <div class="tcl-mobile-btn" id="tcl-btn-custom1" title="カスタム1"></div>
                            <div class="tcl-mobile-btn" id="tcl-btn-custom2" title="カスタム2"></div>
                        </div>
                    `;
                    
                    const btnPrevM = plugin.topBarLine1El.querySelector('#tcl-tb-prev-m');
                    const btnTodayM = plugin.topBarLine1El.querySelector('#tcl-tb-today-m');
                    const btnNextM = plugin.topBarLine1El.querySelector('#tcl-tb-next-m');
                    
                    btnPrevM?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(-1); });
                    btnTodayM?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openTodaysNote(); });
                    btnNextM?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(1); });
    
                    const btnYesterday = plugin.topBarLine3El.querySelector('#tcl-btn-yesterday');
                    const btnAddTask = plugin.topBarLine3El.querySelector('#tcl-btn-addtask');
                    const btnCustom1 = plugin.topBarLine3El.querySelector('#tcl-btn-custom1');
                    const btnCustom2 = plugin.topBarLine3El.querySelector('#tcl-btn-custom2');
    
                    if (btnYesterday) {
                        btnYesterday.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            new Notice("昨日を開きます...");
                            plugin.openRelativeDayNote(-1);
                        }, true);
                    }
                    
                    if (btnAddTask) {
                        setIcon(btnAddTask, 'list-plus');
                        btnAddTask.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            new Notice("タスク追加...");
                            plugin.addTaskFromBar();
                        }, true);
                    }
    
                    if (btnCustom1 && plugin.settings.mobileCustomIcon1) {
                        setIcon(btnCustom1, plugin.settings.mobileCustomIcon1);
                        btnCustom1.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            if (plugin.settings.mobileCustomCommand1) {
                                new Notice("コマンド1実行...");
                                plugin.app.commands.executeCommandById(plugin.settings.mobileCustomCommand1);
                            } else {
                                new Notice("コマンドIDが設定されていません");
                            }
                        }, true);
                    }
    
                    if (btnCustom2 && plugin.settings.mobileCustomIcon2) {
                        setIcon(btnCustom2, plugin.settings.mobileCustomIcon2);
                        btnCustom2.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            if (plugin.settings.mobileCustomCommand2) {
                                new Notice("コマンド2実行...");
                                plugin.app.commands.executeCommandById(plugin.settings.mobileCustomCommand2);
                            } else {
                                new Notice("コマンドIDが設定されていません");
                            }
                        }, true);
                    }
    
                    // Row 4: 3-column Stats Row
                    plugin.topBarLine4El.innerHTML = `
                        <div class="tcl-mobile-grid-3" style="padding: 4px 0;">
                            <div class="tcl-mobile-col"><span>🕒 ${dailyStats.h4Count}</span></div>
                            <div class="tcl-mobile-col" style="border-left: 1px solid var(--background-modifier-border); border-right: 1px solid var(--background-modifier-border);">
                                <span>✎ ${dailyStats.charCount.toLocaleString()}</span>
                            </div>
                            <div class="tcl-mobile-col"><span>⌛ ${plugin.formatMinutes(data.remainingEstimateMin)}</span></div>
                        </div>
                    `;
    
                } else {
                    // LINE 1: Task + Block + Day + NoEst + Weather
                    let l1 = '';
                    if (plugin.settings.showTopBarNav) {
                        l1 += `<span class="tcl-tb-nav"><span class="tcl-tb-nav-btn" id="tcl-tb-prev">◀</span><span class="tcl-tb-nav-btn" id="tcl-tb-today">今日</span><span class="tcl-tb-nav-btn" id="tcl-tb-next">▶</span></span>`;
                    }
                    l1 += `<span class="tcl-tb-time">${data.currentTime}</span>`;
                    if (data.runningTask) {
                        const est = data.runningTask.estimate ? `（${data.runningTask.estimate}m）` : '';
                        l1 += `<span class="tcl-tb-running">▶ ${data.runningTask.title}${est}</span>`;
                    } else {
                        l1 += `<span class="tcl-tb-idle">待機中</span>`;
                    }
                    if (data.blockName) {
                        l1 += `<span class="tcl-tb-sep">│</span><span class="tcl-tb-block">■${data.blockName} 🏁${data.blockEstimatedEnd}</span>`;
                    }
                    l1 += `<span class="tcl-tb-sep">│</span><span class="tcl-tb-remaining">■日終 ${data.estimatedEnd}</span>`;
                    if (data.noEstimateCount > 0) {
                        l1 += `<span class="tcl-tb-noest">!${data.noEstimateCount}</span>`;
                    }
                    l1 += `<span class="tcl-tb-spacer"></span>`;
                    if (weather.temp != null) {
                        const pressureClass = weather.pressure < 1013 ? 'tcl-tb-pressure-low' : '';
                        l1 += `<span class="tcl-tb-weather">${weather.emoji} ${weather.temp}°C</span><span class="tcl-tb-pressure ${pressureClass}">${Math.round(weather.pressure)}hPa</span>`;
                    }
                    plugin.topBarLine1El.innerHTML = l1;
                    
                    if (plugin.settings.showTopBarNav) {
                        plugin.topBarLine1El.querySelector('#tcl-tb-prev')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(-1); });
                        plugin.topBarLine1El.querySelector('#tcl-tb-today')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openTodaysNote(); });
                        plugin.topBarLine1El.querySelector('#tcl-tb-next')?.addEventListener('click', (e) => { e.stopPropagation(); plugin.openRelativeDayNote(1); });
                    }
    
                    // LINE 2: Daily note stats + Double Progress bars
                    // Calculate Task Progress for Top Bar
                    let taskBarHtml = '';
                    if (data.runningTask) {
                        const estMin = parseInt(data.runningTask.estimate, 10);
                        const startTime = moment(data.runningTask.actualStart, 'HHmm');
                        const elapsedMin = Math.round(moment().diff(startTime, 'minutes'));
                        
                        let statusClass = 'on-track';
                        let progressPct = 0;
                        let label = '';
                        
                        if (isNaN(estMin) || estMin <= 0) {
                            statusClass = 'no-estimate';
                            progressPct = 100;
                            label = '見積なし';
                        } else if (elapsedMin > estMin) {
                            statusClass = 'over-due';
                            progressPct = 100;
                            label = `超過: ${elapsedMin - estMin}分`;
                        } else {
                            statusClass = 'on-track';
                            progressPct = Math.round((elapsedMin / estMin) * 100);
                            label = `${elapsedMin}/${estMin}分 (${progressPct}%)`;
                        }
                        
                        taskBarHtml = `
                            <div class="tcl-tb-bar-row task-bar-row ${statusClass}">
                                <div class="tcl-tb-bar-fill" style="width: ${progressPct}%"></div>
                                <span class="tcl-tb-bar-label">${label}</span>
                            </div>`;
                    } else {
                        taskBarHtml = `<div class="tcl-tb-bar-row task-bar-row idle"><span class="tcl-tb-bar-label">待機中</span></div>`;
                    }
    
                    const dayPct = Math.round((moment().hours() * 60 + moment().minutes()) / (24 * 60) * 100);
                    const dayBarHtml = `
                        <div class="tcl-tb-bar-row day-bar-row">
                            <div class="tcl-tb-bar-fill" style="width: ${dayPct}%"></div>
                            <span class="tcl-tb-bar-label">${data.currentTime} / 24h (${dayPct}%)</span>
                        </div>`;
    
                    plugin.topBarLine2El.innerHTML = `
                        <span class="tcl-tb-note-stats">□${dailyStats.h4Count} ✎${dailyStats.charCount.toLocaleString()} 𝕏${dailyStats.selfTwitterCount}</span>
                        <span class="tcl-tb-spacer"></span>
                        <div class="tcl-tb-double-bar">
                            ${taskBarHtml}
                            ${dayBarHtml}
                        </div>
                        <span class="tcl-tb-sep">│</span>
                        <span class="tcl-tb-weekdots">${weekInfo.dots}</span>
                        <span class="tcl-tb-weekday">${weekInfo.dayName}</span>`;
                    
                    // Clear lines 3 & 4
                    plugin.topBarLine3El.innerHTML = '';
                    plugin.topBarLine4El.innerHTML = '';
                }
            } catch (e) {
                console.error("[taskchute-line] updateTopBar error:", e);
                plugin.topBarLine1El.innerHTML = `<span class="tcl-tb-time">${nowTime}</span><span class="tcl-tb-idle">Error</span>`;
                plugin.topBarLine2El.innerHTML = '';
                plugin.topBarLine3El.innerHTML = '';
                plugin.topBarLine4El.innerHTML = '';
            }
        }
}
