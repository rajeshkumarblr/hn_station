import { useRef, useState, useEffect } from 'react';
import { RefreshCw, X, Moon, Sun, LogIn, LogOut, Settings, Shield, Home, Keyboard } from 'lucide-react';
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
        selectedStoryId, selectedStory, stories, availableTags,
        highlightedStoryId,
        setMode, setActiveTopics, setShowHidden,
        setCurrentView, setIsAdminModalOpen,
        handleRefresh, toggleTheme, closeTab, handleHideStory,
        handleToggleQueue, handleStorySelect, handleToggleSave,
        handleStoryInteractWithQueue, handleQueueAllFiltered, readIds
    } = app;

    // Resolve the story object for the highlighted (keyboard/hovered) card
    const highlightedStory = stories.find(s => s.id === highlightedStoryId) ?? null;

    const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
    const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const PAGE_SIZE = 10;
    const isElectron = !!(window as any).electronAPI;

    // Auto-switch to page 1 when a tag filter is active but no current-page
    // stories match — prevents the user from seeing an empty filtered feed.
    useEffect(() => {
        if (activeTopics.length === 0) return;
        const visible = stories.filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden));
        const hasMatch = visible.some(s => getStoryTopicMatch(s.title, s.topics, activeTopics) !== null);
        if (!hasMatch && offset !== 0) setOffset?.(0);
    }, [activeTopics, stories]);

    useGlobalKeyboardNav(app, storyRefs);

    return (
        <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">
            {/* ─── Zen Header ─── */}
            <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            {/* -webkit-app-region:drag makes the header the native Electron drag handle */}
            <header className="bg-[#1a2332] border-b border-slate-700 px-5 flex-shrink-0 z-50 h-[76px] relative" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
                <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    {/* Left — Nav Tabs */}
                    <nav className="h-full flex items-center gap-6 flex-1">
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
                                    className={`h-full flex items-center gap-1.5 text-sm font-medium border-b-2 transition-all outline-none ${isActive
                                        ? 'text-white border-orange-500 pb-3 mt-3'
                                        : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-b-2 hover:border-gray-600'
                                        }`}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Center — Brand */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none h-full py-1 z-10 w-full max-w-[600px]">
                        <div className="flex items-center gap-2 pointer-events-auto">
                            <h1 className="text-xl leading-none font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600 cursor-pointer" onClick={() => window.location.reload()}>
                                HN Station
                            </h1>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded-sm">v4.10</span>
                        </div>
                        {currentView === 'reader' && (
                            <div id="reader-controls-portal" className="flex items-center mt-1.5 pointer-events-auto"></div>
                        )}
                    </div>

                    <div className="flex-1 min-w-0 flex items-center"></div>

                    {/* Right controls */}
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => { handleRefresh(); setOffset?.(0); }} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
                            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                        </button>
                        <button onClick={() => setShowHidden(!showHidden)} className={`p-2 rounded-lg ${showHidden ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-slate-800 text-slate-400'}`}>
                            <Settings size={16} />
                        </button>
                        <button onClick={() => setIsHelpOpen(true)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 ml-1" title="Keyboard Shortcuts">
                            <Keyboard size={16} />
                        </button>

                        {/* Auth */}
                        {user ? (
                            <div className="flex items-center gap-2 ml-1">
                                {user.is_admin && (
                                    <button onClick={() => setIsAdminModalOpen(true)} className="p-2 mr-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                                        <Shield size={14} />
                                    </button>
                                )}
                                <img src={user.avatar_url} alt={user.name} className="w-7 h-7 rounded-full ring-2 ring-slate-700" title={user.name} />
                                <a href="/auth/logout" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><LogOut size={16} /></a>
                            </div>
                        ) : !isElectron ? (
                            <a href="/auth/google" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold ml-1">
                                <LogIn size={14} /> Sign in
                            </a>
                        ) : null}

                        {/* Window controls — Windows style, only in Electron */}
                        {isElectron && (
                            <div className="flex items-center ml-3 pl-2 border-l border-slate-700/60" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
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
            </header>

            {/* Global Tab Bar Container */}
            {tabs.length > 0 && (
                <div className="flex bg-[#0f172a] overflow-x-auto shadow-sm border-b border-slate-700/50 shrink-0">
                    <button
                        onClick={() => { setCurrentView('feed'); }}
                        className={`flex flex-shrink-0 items-center gap-2 px-4 py-3 min-w-[100px] border-r border-slate-800 ${currentView === 'feed' ? 'bg-[#1e293b] text-blue-400 border-t-2 border-t-blue-500' : 'bg-[#111622] text-slate-400 border-t-2 border-t-transparent hover:bg-[#1a2332]'}`}
                    >
                        <Home size={16} /> <span className="text-sm font-medium">Feed</span>
                    </button>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => { app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                            className={`flex flex-shrink-0 items-center gap-3 px-4 py-3 min-w-[160px] max-w-[280px] border-r border-slate-800 ${currentView === 'reader' && activeTabId === t.id ? 'bg-[#1e293b] text-blue-400 border-t-2 border-t-blue-500' : 'bg-[#111622] text-slate-400 border-t-2 border-t-transparent hover:bg-[#1a2332]'}`}
                        >
                            <span className="truncate flex-1 text-sm text-left font-medium">{t.story.title}</span>
                            <div onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} className="p-1 rounded-md text-slate-500 hover:text-red-400"><X size={14} /></div>
                        </button>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {currentView === 'feed' ? (
                    <main className="flex-1 overflow-hidden bg-white dark:bg-slate-950 flex focus:outline-none" tabIndex={-1}>
                        <div className="flex w-full h-full relative">
                            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                                <div className="flex-1 overflow-hidden px-3 pt-1">
                                    {loading && <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-blue-500" /></div>}
                                    {!loading && (
                                        // CSS grid: always exactly 10 equal rows, no scroll, fills all space
                                        <div className="h-full" style={{ display: 'grid', gridTemplateRows: `repeat(${PAGE_SIZE}, 1fr)`, gap: '2px' }}>
                                            {stories.length === 0 && <div className="p-10 text-white bg-red-600 rounded-lg col-span-full">ZERO STORIES IN BUFFER</div>}
                                            {stories.filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden)).slice(0, PAGE_SIZE).map((story, index) => {
                                                const isSelected = selectedStoryId === story.id;
                                                const isHighlighted = app.highlightedStoryId === story.id;
                                                const isRead = readIds.has(story.id) || !!story.is_read;
                                                const isQueued = readingQueue.includes(story.id);
                                                const matchedTopic = activeTopics.length > 0 ? getStoryTopicMatch(story.title, story.topics, activeTopics) : null;
                                                const tagStyle = matchedTopic ? getTagStyle(matchedTopic) : null;
                                                return (
                                                    <div key={story.id} ref={el => storyRefs.current[index] = el}
                                                        onClick={() => handleStoryInteractWithQueue(story.id, matchedTopic)}
                                                        style={tagStyle ? { borderLeft: `3px solid ${tagStyle.color}` } : undefined}
                                                        className="transition-all duration-150 rounded-lg overflow-hidden"
                                                    >
                                                        <StoryCard
                                                            story={story} index={index} isSelected={isSelected} isHighlighted={isHighlighted} isRead={isRead} isQueued={isQueued} isEven={index % 2 === 0}
                                                            titleColorStyle={tagStyle?.color} topicTextClass={null} onSelect={handleStorySelect} onOpenInTab={handleStorySelect}
                                                            onToggleSave={user ? handleToggleSave : undefined} onHide={handleHideStory} onQueueToggle={handleToggleQueue}
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Pagination Controls Fixed at Bottom */}
                                {!loading && (
                                    <div className="shrink-0 w-full bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800/60 flex justify-center mt-auto">
                                        <div className="w-full max-w-4xl flex justify-center items-center px-6 py-4 gap-2">
                                            <button
                                                onClick={() => setOffset?.(Math.max(0, offset - PAGE_SIZE))}
                                                disabled={offset === 0}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                                            >
                                                Prev
                                            </button>
                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: Math.ceil((totalStories || 0) / PAGE_SIZE) }, (_, i) => i + 1).map(p => {
                                                    const pageOffset = (p - 1) * PAGE_SIZE;
                                                    const isActive = offset === pageOffset;
                                                    return (
                                                        <button
                                                            key={p}
                                                            onClick={() => setOffset?.(pageOffset)}
                                                            className={`w-8 h-8 flex items-center justify-center rounded-md text-sm font-bold transition-all ${isActive
                                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-110'
                                                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                                                }`}
                                                        >
                                                            {p}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={() => setOffset?.(offset + PAGE_SIZE)}
                                                disabled={!hasMore}
                                                className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <FilterSidebar activeTopics={activeTopics} setActiveTopics={setActiveTopics} getQueuedCount={() => readingQueue.length} onQueueAll={handleQueueAllFiltered} availableTags={availableTags} highlightedStory={highlightedStory} />
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
        </div>
    );
}
