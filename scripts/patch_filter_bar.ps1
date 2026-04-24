
$path = "c:\Users\rajes\proj\hn_station\web\src\layouts\DesktopLayout.tsx"
$lines = [IO.File]::ReadAllLines($path)

Write-Host "Total lines before: $($lines.Length)"

# The new filter bar content to replace lines 273-288 (idx 272-287)
$newFilterBar = @'
                                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-sm shrink-0">
                                        <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                                            {/* Filters Section */}
                                            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar flex-1 mr-4">
                                                <span className="text-[10px] font-black underline uppercase text-slate-400 shrink-0">Filters:</span>

                                                {/* Active Filters */}
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {activeTopics.filter(t => !disabledTopics.includes(t)).map(t => {
                                                        const style = getTagStyle(t);
                                                        return (
                                                            <div
                                                                key={`active-${t}`}
                                                                onClick={() => setDisabledTopics(prev => [...prev, t])}
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer hover:brightness-95 transition-all shadow-sm"
                                                                style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
                                                            >
                                                                <span>#{t}</span>
                                                                <X size={10} onClick={(e) => { e.stopPropagation(); setActiveTopics(prev => prev.filter(x => x !== t)); }} className="hover:text-red-500" />
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {activeTopics.filter(t => !disabledTopics.includes(t)).length > 0 && activeTopics.filter(t => disabledTopics.includes(t)).length > 0 && (
                                                    <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
                                                )}

                                                {/* Inactive Filters */}
                                                <div className="flex items-center gap-2 shrink-0 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                                                    {activeTopics.filter(t => disabledTopics.includes(t)).map(t => {
                                                        const style = getTagStyle(t);
                                                        return (
                                                            <div
                                                                key={`inactive-${t}`}
                                                                onClick={() => setDisabledTopics(prev => prev.filter(x => x !== t))}
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                                            >
                                                                <span>#{t}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                {activeTopics.length > 0 && (
                                                    <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                        <button
                                                            onClick={() => { setDisabledTopics(prev => [...new Set([...prev, ...activeTopics])]); }}
                                                            className="px-2 py-1 rounded-md hover:bg-white dark:hover:bg-slate-700 text-[10px] font-bold uppercase transition-all text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                                            title="Disable all active filters"
                                                        >
                                                            Disable All
                                                        </button>
                                                        <button
                                                            onClick={() => { setActiveTopics([]); setDisabledTopics([]); }}
                                                            className="px-2 py-1 rounded-md hover:bg-red-500 hover:text-white text-red-600 dark:text-red-400 text-[10px] font-black uppercase transition-all"
                                                            title="Remove all filters"
                                                        >
                                                            Remove All
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Add Filter */}
                                                <div className="relative flex items-center">
                                                    <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                                                        <Search size={10} className="text-slate-400" />
                                                        <input
                                                            type="text"
                                                            placeholder="Add filter..."
                                                            className="bg-transparent border-none outline-none text-[11px] font-bold w-20 focus:w-32 transition-all placeholder:text-slate-400"
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    const val = e.currentTarget.value.trim();
                                                                    if (val) {
                                                                        setActiveTopics(prev => prev.includes(val) ? prev : [...prev, val]);
                                                                        setDisabledTopics(prev => prev.filter(x => x !== val));
                                                                        e.currentTarget.value = '';
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={handleRefresh}
                                                    className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all shadow-sm active:scale-95"
                                                    title="Refresh stories"
                                                >
                                                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
'@

$newFilterBarLines = $newFilterBar -split "`n" | ForEach-Object { $_.TrimEnd("`r") }
# Remove the leading empty line from the here-string
if ($newFilterBarLines[0] -eq '') { $newFilterBarLines = $newFilterBarLines[1..($newFilterBarLines.Length-1)] }
# Remove trailing empty line
while ($newFilterBarLines[-1] -eq '') { $newFilterBarLines = $newFilterBarLines[0..($newFilterBarLines.Length-2)] }

$newLines = @()
$newLines += $lines[0..271]                               # L1-272
$newLines += $newFilterBarLines                            # new filter bar
$newLines += $lines[288..($lines.Length-1)]               # L289 onwards

[IO.File]::WriteAllLines($path, $newLines)
Write-Host "Done. Lines: $($newLines.Length)"
