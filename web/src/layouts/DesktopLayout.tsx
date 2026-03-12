import { useRef, useState, useEffect } from 'react';
import { RefreshCw, Moon, Sun, Home, Settings, Keyboard, Shield, LogIn, LogOut, X } from 'lucide-react';
import { StoryCard, getTagStyle } from '../components/StoryCard';
import { ReaderPane } from '../components/ReaderPane';
import { FilterSidebar } from '../components/FilterSidebar';
import { AdminDashboard } from '../components/AdminDashboard';
import { getStoryTopicMatch } from '../hooks/useAppState';
import { useGlobalKeyboardNav } from '../hooks/useGlobalKeyboardNav';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';
import { MODES } from '../types';

export function DesktopLayout({ app }: { app: ReturnType<typeof import('../hooks/useAppState').useAppState> }) {
    const {
        loading, mode, activeTopics,
        theme,
        tabs, activeTabId, showHidden,
        currentView, readingQueue, isAdminModalOpen, user,
        hiddenStories, offset, setOffset, totalStories, hasMore,
        selectedStoryId, selectedStory, stories,
        highlightedStoryId,
        setMode, setActiveTopics, setShowHidden,
        setCurrentView, setIsAdminModalOpen,
        handleRefresh, toggleTheme, closeTab, handleHideStory,
        handleToggleQueue, handleStorySelect, handleToggleSave,
        readIds, setReadIds, setHighlightedStoryId
    } = app;

    // Resolve the story object for the highlighted (keyboard/hovered) card
    const highlightedStory = stories.find(s => s.id === highlightedStoryId) ?? null;

    const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
    const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const PAGE_SIZE = 10;
    const isElectron = !!(window as any).electronAPI;

    // Auto-switch to page 1 only when the user MANUALLY changes activeTopics.
    // (Handled via setOffset(0) in FilterSidebar or useAppState, not here to avoid pagination jump)

    useGlobalKeyboardNav(app, storyRefs);

    // Default focus: if we have stories and none is highlighted, pick the first one.
    // Also if the stories list changes (e.g. refresh/page change), reset to first.
    useEffect(() => {
        if (!loading && stories.length > 0) {
            const hasHighlighted = stories.some(s => s.id === highlightedStoryId);
            if (!hasHighlighted) {
                setHighlightedStoryId(stories[0].id);
            }
        }
    }, [stories, loading, highlightedStoryId]);

    // 10s Auto-Read Timer
    useEffect(() => {
        if (!highlightedStoryId || !user) return;
        const isAlreadyRead = readIds.has(highlightedStoryId) || highlightedStory?.is_read;
        if (isAlreadyRead) return;

        const timer = setTimeout(() => {
            const baseUrl = app.apiBase;
            if (!baseUrl) return;

            // Mark as read in state
            setReadIds(prev => {
                const next = new Set(prev);
                next.add(highlightedStoryId);
                // saveReadIds is handled in useAppState's useEffect but we can be explicit if needed
                return next;
            });

            // Mark as read in backend
            fetch(`${baseUrl}/api/stories/${highlightedStoryId}/interact`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true }),
            }).catch(() => { });
        }, 10000); // 10 seconds

        return () => clearTimeout(timer);
    }, [highlightedStoryId, readIds, user, highlightedStory, app.apiBase]);
    return (
        <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">
            {/* ─── Zen Header ─── */}
            <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            {/* -webkit-app-region:drag makes the header the native Electron drag handle */}
            <header className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-5 flex-shrink-0 z-50 h-[56px] relative" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="h-full flex items-center relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {/* Absolute Center Layer: Branding & Reader Controls */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div className="flex items-center gap-10 whitespace-nowrap pointer-events-auto">
                            {/* Left: Mode Switcher Portal */}
                            <div id="reader-mode-portal" className="flex items-center min-w-[120px] justify-end"></div>

                            {/* Center: Branding */}
                            <div className="flex flex-col items-center">
                                <span className="text-sm font-black tracking-tighter text-[#ff6600] uppercase">HN Station</span>
                                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 opacity-60 leading-tight">v4.46</span>
                            </div>

                            {/* Right: Actions Portal */}
                            <div id="reader-actions-portal" className="flex items-center min-w-[150px] justify-start"></div>
                        </div>
                    </div>

                    {/* Content Layers (Left/Right) */}
                    <div className="flex-1 flex items-center justify-between h-full relative z-10 pointer-events-none">
                        {/* Left Section: Menu */}
                        <div className="flex items-center h-full pointer-events-auto bg-slate-100 dark:bg-slate-800 pr-6">
                            <nav className="h-full flex items-center gap-6">
                                {MODES.map((m, i) => {
                                    const isActive = mode === m.key;
                                    return (
                                        <button
                                            key={m.key}
                                            ref={el => modeButtonRefs.current[i] = el}
                                            onClick={() => {
                                                if (mode === m.key) handleRefresh();
                                                else { setMode(m.key as any); setOffset?.(0); }
                                                setCurrentView('feed');
                                            }}
                                            className={`h-full flex items-center text-xs font-bold transition-all outline-none border-b-2 ${isActive
                                                ? 'text-white border-white'
                                                : 'text-blue-100/70 border-transparent hover:text-white hover:border-white/50'
                                                }`}
                                        >
                                            {m.label}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Right Section: App Controls */}
                        <div className="flex items-center justify-end gap-1.5 shrink-0 pointer-events-auto bg-slate-100 dark:bg-slate-800 pl-6">
                            <button onClick={() => { handleRefresh(); setOffset?.(0); }} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
                                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                            </button>
                            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
                                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                            </button>
                            <button onClick={() => setShowHidden(!showHidden)} className={`p-2 rounded-lg ${showHidden ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                <Settings size={16} />
                            </button>
                            <button onClick={() => setIsHelpOpen(true)} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 ml-1" title="Keyboard Shortcuts">
                                <Keyboard size={16} />
                            </button>

                            {/* Auth — Only show in Web version */}
                            {!isElectron && (
                                <>
                                    {user ? (
                                        <div className="flex items-center gap-2 ml-1">
                                            {user.is_admin && (
                                                <button onClick={() => setIsAdminModalOpen(true)} className="p-2 mr-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                                                    <Shield size={14} />
                                                </button>
                                            )}
                                            <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full ring-2 ring-slate-300 dark:ring-slate-700" title={user.name} />
                                            <a href="/auth/logout" className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"><LogOut size={16} /></a>
                                        </div>
                                    ) : (
                                        <a href="/auth/google" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold ml-1">
                                            <LogIn size={14} /> Sign in
                                        </a>
                                    )}
                                </>
                            )}

                            {/* Window controls — Windows style, only in Electron */}
                            {isElectron && (
                                <div className="flex items-center ml-3 pl-2 border-l border-slate-300 dark:border-slate-700/60" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                                    {/* Minimize */}
                                    <button
                                        onClick={() => (window as any).electronAPI.minimize()}
                                        className="w-11 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-600/60 hover:text-white transition-colors text-sm"
                                        title="Minimize"
                                    >
                                        <span className="text-base leading-none select-none">─</span>
                                    </button>
                                    {/* Maximize */}
                                    <button
                                        onClick={() => (window as any).electronAPI.maximize()}
                                        className="w-11 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-600/60 hover:text-white transition-colors text-sm"
                                        title="Maximize / Restore"
                                    >
                                        <span className="text-[11px] leading-none select-none border border-current" style={{ padding: '1px 3px' }}>□</span>
                                    </button>
                                    {/* Close */}
                                    <button
                                        onClick={() => (window as any).electronAPI.close()}
                                        className="w-11 h-8 flex items-center justify-center text-slate-400 hover:bg-red-600 hover:text-white transition-colors text-base font-bold"
                                        title="Close"
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Global Tab Bar Container (Neutral Theme - Flush) */}
            {tabs.length > 0 && (
                <div className="flex bg-slate-100 dark:bg-slate-800 overflow-x-auto border-b border-slate-200 dark:border-slate-700 shrink-0 gap-0">
                    <button
                        onClick={() => { setCurrentView('feed'); }}
                        className={`flex flex-shrink-0 items-center justify-center gap-2 px-6 py-2 rounded-t-lg border transition-all h-[44px] relative -mb-[1px] ${currentView === 'feed'
                            ? 'bg-white dark:bg-[#1e293b] text-blue-600 dark:text-blue-400 border-amber-200/50 border-b-white dark:border-b-[#1e293b] shadow-[0_-2px_8px_rgba(0,0,0,0.1)] z-10'
                            : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold self-end border-b-0'}`}
                    >
                        <Home size={14} /> <span className="text-[12px] font-bold tracking-tight uppercase">Feed</span>
                    </button>
                    {tabs.map(t => {
                        const isActive = currentView === 'reader' && activeTabId === t.id;
                        const domain = t.story.url ? new URL(t.story.url).hostname : 'news.ycombinator.com';
                        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

                        return (
                            <div
                                key={t.id}
                                className={`flex flex-shrink-0 items-center rounded-t-lg border relative group transition-all w-[180px] h-[44px] -mb-[1px] ${isActive
                                    ? 'bg-white dark:bg-[#111d2e] text-blue-600 dark:text-blue-400 border-amber-200 border-b-white dark:border-b-[#111d2e] shadow-[0_-2px_10px_rgba(0,0,0,0.15)] z-10'
                                    : 'bg-transparent border-amber-200/20 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 self-end border-b-0'}`}
                            >
                                <button
                                    onClick={() => { app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                                    className="flex-1 flex items-center gap-2 px-3 py-1 overflow-hidden min-w-0 h-full"
                                    title={t.story.title}
                                >
                                    <img src={faviconUrl} alt="" className="w-3.5 h-3.5 rounded-sm flex-shrink-0" />
                                    <span className={`truncate text-[11px] font-bold select-none text-left ${isActive ? 'opacity-100' : 'opacity-80'}`}>{t.story.title}</span>
                                </button>
                                <div onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} className={`p-1 mr-2 rounded-md transition-all flex-shrink-0 cursor-pointer ${isActive ? 'text-slate-400 hover:text-white hover:bg-red-500' : 'text-slate-500 dark:text-slate-400 hover:text-white hover:bg-red-500 opacity-0 group-hover:opacity-100'}`}>
                                    <X size={10} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {currentView === 'feed' ? (
                    <main className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 flex focus:outline-none" tabIndex={-1}>
                        <div className="flex w-full h-full relative">
                            <div className="flex-1 flex flex-col h-full overflow-hidden">
                                <div className="flex-1 flex flex-col h-full w-full">
                                    {loading && <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-blue-500" /></div>}
                                    {!loading && (
                                        <div className="flex-1 flex flex-col h-full gap-0 overflow-y-auto custom-scrollbar">
                                            {stories.length > 0 && (() => {
                                                const unfiltered = stories.filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden));
                                                const filtered = unfiltered.slice(0, PAGE_SIZE);

                                                if (filtered.length === 0) {
                                                    return (
                                                        <div className="p-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                                                            <div className="text-slate-400 dark:text-slate-500 font-medium mb-1">No matching stories found</div>
                                                            <button onClick={() => setActiveTopics([])} className="text-blue-500 text-xs font-bold hover:underline">Clear search filters</button>
                                                        </div>
                                                    );
                                                }

                                                return filtered.map((story, index) => {
                                                    const isSelected = selectedStoryId === story.id;
                                                    const isHighlighted = app.highlightedStoryId === story.id;
                                                    const isRead = readIds.has(story.id) || !!story.is_read;
                                                    const isQueued = readingQueue.includes(story.id);
                                                    const matchedTopic = activeTopics.length > 0 ? getStoryTopicMatch(story.title, story.topics, activeTopics) : null;
                                                    const tagStyle = matchedTopic ? getTagStyle(matchedTopic) : null;
                                                    return (
                                                        <div key={story.id} ref={el => storyRefs.current[index] = el}
                                                            onClick={(e) => { e.stopPropagation(); setHighlightedStoryId(story.id); }}
                                                            onDoubleClick={(e) => { e.stopPropagation(); handleStorySelect(story.id, 'split'); }}
                                                            style={tagStyle ? { borderLeft: `3px solid ${tagStyle.color}` } : undefined}
                                                            className="basis-[10%] flex-shrink-0 flex flex-col transition-all duration-150 overflow-hidden"
                                                        >
                                                            <StoryCard
                                                                story={story} index={offset + index} isSelected={isSelected} isHighlighted={isHighlighted} isRead={isRead} isQueued={isQueued} isEven={index % 2 === 0}
                                                                titleColorStyle={tagStyle?.color} topicTextClass={null} onSelect={() => setHighlightedStoryId(story.id)}
                                                                onOpenInTab={(id, mode) => handleStorySelect(id, mode)}
                                                                onToggleSave={user ? handleToggleSave : undefined} onHide={handleHideStory} onQueueToggle={handleToggleQueue}
                                                                activeTopics={activeTopics}
                                                            />
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    )}
                                </div>

                                {/* Pagination Controls Fixed at Bottom */}
                                {totalStories > PAGE_SIZE && !loading && (
                                    <div className="shrink-0 w-full bg-slate-900 border-t border-slate-700/50 flex justify-center mt-auto shadow-[0_-4px_12px_rgba(0,0,0,0.2)]">
                                        <div className="w-full max-w-none flex justify-center items-center px-6 py-4 gap-4">
                                            <button
                                                onClick={() => setOffset?.(Math.max(0, offset - PAGE_SIZE))}
                                                disabled={offset === 0}
                                                className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-20 transition-all border border-slate-700/50"
                                            >
                                                Prev
                                            </button>
                                            <div className="flex items-center gap-2">
                                                {(() => {
                                                    const totalPages = Math.ceil((totalStories || 0) / PAGE_SIZE);

                                                    // User requested: 1, 2, 3, 4, 5 ... <last page>
                                                    const displayPages: (number | string)[] = [];
                                                    const maxSequence = 5;

                                                    for (let i = 1; i <= Math.min(maxSequence, totalPages); i++) {
                                                        displayPages.push(i);
                                                    }

                                                    if (totalPages > maxSequence) {
                                                        if (totalPages > maxSequence + 1) {
                                                            displayPages.push('...');
                                                        }
                                                        displayPages.push(totalPages);
                                                    }

                                                    return displayPages.map((p, idx) => {
                                                        if (p === '...') return <span key={`dots-${idx}`} className="px-3 text-slate-500 font-black text-lg select-none">···</span>;

                                                        const pageOffset = (Number(p) - 1) * PAGE_SIZE;
                                                        const isActive = offset === pageOffset;
                                                        return (
                                                            <button
                                                                key={`page-${p}`}
                                                                onClick={() => setOffset?.(pageOffset)}
                                                                className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-black transition-all duration-300 ${isActive
                                                                    ? 'bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-110 border-2 border-blue-400/50'
                                                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-700/30'
                                                                    }`}
                                                            >
                                                                {p}
                                                            </button>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                            <button
                                                onClick={() => setOffset?.(offset + PAGE_SIZE)}
                                                disabled={!hasMore}
                                                className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-20 transition-all border border-slate-700/50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <FilterSidebar
                                activeTopics={activeTopics}
                                setActiveTopics={setActiveTopics}
                                disabledTopics={app.disabledTopics}
                                setDisabledTopics={app.setDisabledTopics}
                                getQueuedCount={() => readingQueue.length}
                                highlightedStory={highlightedStory}
                            />
                        </div>
                    </main>
                ) : (
                    // Reader view: render ALL tabs simultaneously, show only the active one
                    <div className="flex-1 w-full bg-[#111d2e] flex flex-col relative">
                        {tabs.map(tab => {
                            const isActive = currentView === 'reader' && activeTabId === tab.id;
                            const activeMode = tab.mode || 'split';
                            return (
                                <div
                                    key={tab.id}
                                    className="absolute inset-0"
                                    style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}
                                >
                                    <ReaderPane
                                        story={tab.story}
                                        isActive={isActive}
                                        activeTab={activeMode as any}
                                        onTabChange={(m) => {
                                            app.handleStorySelect?.(tab.storyId, m);
                                        }}
                                        onFocusList={() => setCurrentView('feed')}
                                        onTakeFocus={() => { }}
                                        onToggleSave={user ? handleToggleSave : undefined}
                                        onHide={(id) => { handleHideStory(id); setCurrentView('feed'); }}
                                    />
                                </div>
                            );
                        })}
                        {(!tabs.length || !selectedStory) && (
                            <div className="h-full flex items-center justify-center text-slate-500">Select a story</div>
                        )}
                    </div>
                )}
                {isAdminModalOpen && <AdminDashboard onClose={() => setIsAdminModalOpen(false)} />}
            </div>

            {/* Status Bar */}
            <div className="h-6 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center shrink-0 z-50">
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Context:</span>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 truncate">
                        {currentView === 'reader' && selectedStory ? selectedStory.title : (highlightedStory ? highlightedStory.title : 'HN Station Feed')}
                    </span>
                </div>
                <div className="flex-1"></div>
                <div className="text-[10px] font-bold text-slate-500/50 uppercase tracking-widest">
                    {currentView === 'feed' ? `Page ${Math.floor(offset / PAGE_SIZE) + 1}` : 'Reader View'}
                </div>
            </div>
        </div>
    );
}
