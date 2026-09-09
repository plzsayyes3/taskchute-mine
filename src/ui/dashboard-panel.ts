import { moment } from 'obsidian';
import { showPanel } from '@codemirror/view';
import { StateField } from '@codemirror/state';

export function buildDashboardPanelExtension(plugin) {
    const dashboardField = StateField.define({
        create() {
            return null;
        },
        update(value, tr) {
            return value;
        },
        provide(field) {
            return showPanel.from(field, () => {
                // Check if dashboard is enabled and we're viewing a log file
                const activeFile = plugin.app.workspace.getActiveFile();
                if (!plugin.settings.enableDashboard) return null;
                // Allow showing only nav buttons if not in a log file
                const isLog = activeFile && plugin.isLogFilePath(activeFile.path);

                return (view) => {
                    const dom = document.createElement('div');
                    dom.className = 'tcl-dashboard';

                    const line0 = document.createElement('div');
                    line0.className = 'tcl-dashboard-nav';
                    const line1 = document.createElement('div');
                    line1.className = 'tcl-dashboard-line1';
                    const line2 = document.createElement('div');
                    line2.className = 'tcl-dashboard-line2';
                    dom.appendChild(line0);
                    dom.appendChild(line1);
                    dom.appendChild(line2);

                    // Add mobile toggle if on mobile
                    if (plugin.app.isMobile) {
                        const toggle = document.createElement('div');
                        toggle.className = 'tcl-dashboard-toggle';
                        toggle.innerHTML = '▼';
                        dom.appendChild(toggle);
                        let expanded = false;
                        toggle.addEventListener('click', (e) => {
                            e.stopPropagation();
                            expanded = !expanded;
                            if (expanded) {
                                dom.classList.add('tcl-dashboard-expanded');
                                toggle.innerHTML = '▲';
                            } else {
                                dom.classList.remove('tcl-dashboard-expanded');
                                toggle.innerHTML = '▼';
                            }
                        });
                    }

                    function refresh() {
                        const text = view.state.doc.toString();
                        const data = plugin.computeDashboardData(text);

                        // Line 0: Navigation
                        const currentFile = plugin.app.workspace.getActiveFile();
                        const isLog = currentFile && plugin.isLogFilePath(currentFile.path);
                        const fileDate = isLog ? moment(currentFile.basename, 'YYYY-MM-DD', true) : moment();
                        
                        line0.innerHTML = '';
                        const prevBtn = line0.createEl('button', { text: '◀', cls: 'tcl-nav-btn' });
                        const todayBtn = line0.createEl('button', { text: isLog ? fileDate.format('YYYY-MM-DD (ddd)') : '今日を開く', cls: 'tcl-nav-btn tcl-nav-today' });
                        const nextBtn = line0.createEl('button', { text: '▶', cls: 'tcl-nav-btn' });
                        
                        prevBtn.onclick = () => plugin.openRelativeDayNote(-1);
                        todayBtn.onclick = () => plugin.openTodaysNote();
                        nextBtn.onclick = () => plugin.openRelativeDayNote(1);

                        if (!isLog) {
                            line1.innerHTML = '<span class="tcl-d-idle">ログファイル以外を表示中</span>';
                            line2.innerHTML = '';
                            return;
                        }

                        // Line 1: Current task info
                        let l1 = '';
                        const timeSpan = `<span class="tcl-d-time">🕐 ${data.currentTime}</span>`;
                        if (data.runningTask) {
                            const est = data.runningTask.estimate ? `（${data.runningTask.estimate}m）` : '';
                            const startFmt = data.runningTask.actualStart
                                ? data.runningTask.actualStart.replace(/(\d{2})(\d{2})/, '$1:$2')
                                : '--:--';
                            l1 = `${timeSpan}<span class="tcl-d-sep">│</span><span class="tcl-d-running">▶ ${data.runningTask.title}${est}</span><span class="tcl-d-sep">│</span><span class="tcl-d-start">開始 ${startFmt}</span>`;
                        } else {
                            l1 = `${timeSpan}<span class="tcl-d-sep">│</span><span class="tcl-d-idle">待機中</span>`;
                        }
                        line1.innerHTML = l1;

                        // Line 2: Summary
                        const remainStr = plugin.formatRemainingTime(data.remainingEstimateMin);
                        const pct = data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;
                        line2.innerHTML = `<span class="tcl-d-progress">✅ ${data.completedTasks}/${data.totalTasks}</span><span class="tcl-d-pct">${pct}%</span><span class="tcl-d-sep">│</span><span class="tcl-d-remaining">⏱ 残り ${remainStr}</span><span class="tcl-d-sep">│</span><span class="tcl-d-eta">🏁 推定終了 ${data.estimatedEnd}</span>`;
                    }

                    refresh();

                    // Auto-refresh every 30 seconds for time updates
                    const intervalId = window.setInterval(refresh, 30000);

                    return {
                        dom: dom,
                        top: true,
                        update(update) {
                            if (update.docChanged) {
                                refresh();
                            }
                        },
                        destroy() {
                            window.clearInterval(intervalId);
                        }
                    };
                };
            });
        }
    });

    return [dashboardField];
}
