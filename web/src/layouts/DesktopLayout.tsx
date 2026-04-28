import { useRef, useState, useEffect } from 'react';
import { RefreshCw, Home, Bookmark, Settings, X, Search } from 'lucide-react';
import { StoryCard, getTagStyle } from '../components/StoryCard';
import { ReaderPane } from '../components/ReaderPane';
import { FilterSidebar } from '../components/FilterSidebar';
import { AdminDashboard } from '../components/AdminDashboard';
import { SettingsModal } from '../components/SettingsModal';
import { useGlobalKeyboardNav } from '../hooks/useGlobalKeyboardNav';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';
import { StatusBar } from '../components/StatusBar';
import { MODES } from '../types';
import { isElectron as getIsElectron } from '../utils/env';
import { fetchWithAuth } from '../utils/api';

export function DesktopLayout({ app }: { app: ReturnType<typeof import('../hooks/useAppState').useAppState> }) {
    const {
        loading, mode, activeTopics,
        tabs, activeTabId,
        currentView, isAdminModalOpen, user,
        offset, setOffset, totalStories, hasMore,
        selectedStoryId, stories,
        highlightedStoryId, isSettingsOpen,
        setMode, setActiveTopics,
        setCurrentView, setIsAdminModalOpen, setIsSettingsOpen,
        handleRefresh, closeTab, handleHideStory,
        handleStorySelect, handleToggleSave,
        readIds, setReadIds, setHighlightedStoryId,
        primaryTab, setPrimaryTab,
        disabledTopics, setDisabledTopics,
    } = app;
    const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const PAGE_SIZE = 10;
    const isElectron = getIsElectron();

    // Resolve the story object for the highlighted (keyboard/hovered) card
    const highlightedStory = stories.find(s => s.id === highlightedStoryId) ?? null;

    useGlobalKeyboardNav(app, storyRefs);

    useEffect(() => {
        if (!loading && stories.length > 0) {
            const hasHighlighted = stories.some(s => s.id === highlightedStoryId);
            if (!hasHighlighted) {
                setHighlightedStoryId(stories[0].id);
            }
        }
    }, [stories, loading, highlightedStoryId]);

    // Mark as read after 10s
    useEffect(() => {
        if (!highlightedStoryId || !user) return;
        const isAlreadyRead = readIds.has(highlightedStoryId) || highlightedStory?.is_read;
        if (isAlreadyRead) return;

        const timer = setTimeout(() => {
            const baseUrl = app.apiBase;
            if (!baseUrl) return;

            setReadIds(prev => {
                const next = new Set(prev);
                next.add(highlightedStoryId);
                return next;
            });

            fetchWithAuth(`${baseUrl}/api/stories/${highlightedStoryId}/interact`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true }),
            }).catch(() => { });
        }, 10000);

        return () => clearTimeout(timer);
    }, [highlightedStoryId, readIds, user, highlightedStory, app.apiBase]);

    return (
        <div className="h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 font-sans overflow-hidden flex flex-col transition-colors duration-200">
            {/* ─── Zen Header ─── */}
            <header 
                className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-[52px] flex items-center justify-between px-6 shrink-0 z-[100] relative select-none"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                {/* Left Section: Modes & Global Filters */}
                <div className="flex items-center h-full gap-5 flex-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <nav className="h-full flex items-center gap-2 shrink-0">
                        {MODES.map((m) => {
                            const isActiveInPrimary = (primaryTab === 'feed' && m.key === mode) || (primaryTab === 'bookmarks' && m.key === 'saved');
                            const isSelected = isActiveInPrimary;
                            return (
                                <button
                                    key={m.key}
                                    onClick={() => {
                                        if (m.key === 'saved') setPrimaryTab('bookmarks');
                                        else {
                                            setPrimaryTab('feed');
                                            if (mode === m.key && primaryTab === 'feed') handleRefresh();
                                            else { setMode(m.key as any); setOffset?.(0); }
                                        }
                                        setCurrentView('feed');
                                    }}
                                    className={`text-[11px] font-bold tracking-tight transition-all outline-none px-3 py-1.5 rounded-full ${isSelected
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                                        : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
                    
                    <button
                        onClick={handleRefresh}
                        className={`p-2 rounded-full text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all ${loading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw size={15} />
                    </button>
                </div>

                {/* Center Branding */}
                <div 
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none hidden lg:flex"
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[13px] font-black tracking-[0.2em] bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent uppercase leading-none">HN Station</span>
                    </div>
                </div>

                {/* Right Section: Controls */}
                <div className="flex items-center gap-1.5 h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button 
                        onClick={() => setIsSettingsOpen(true)} 
                        className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors" 
                    >
                        <Settings size={18} />
                    </button>
                    {isElectron && (
                        <div className="flex items-center ml-3 border-l border-slate-200 dark:border-slate-800 pl-1 h-full">
                            <button onClick={() => (window as any).electronAPI?.minimize()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><span className="text-sm">─</span></button>
                            <button onClick={() => (window as any).electronAPI?.maximize()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"><span className="text-[10px] border border-current px-0.5">□</span></button>
                            <button onClick={() => (window as any).electronAPI?.close()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors"><X size={16} /></button>
                        </div>
                    )}
                </div>
            </header>


            {/* Global Tab Bar Container */}
            {tabs.length > 0 && (
                <div className="flex bg-slate-50 dark:bg-[#020617] overflow-hidden border-b border-slate-200 dark:border-slate-800 shrink-0 gap-px">
                    <button
                        onClick={() => { setPrimaryTab('feed'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-4 py-2 transition-all h-[40px] min-w-[140px] shrink-0 border-r border-slate-200 dark:border-slate-800 ${currentView === 'feed' && primaryTab === 'feed'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/50'}`}
                    >
                        <Home size={14} className={currentView === 'feed' && primaryTab === 'feed' ? 'text-indigo-500' : 'text-slate-400'} /> 
                        <span className="text-[12px]">Feed(Top)</span>
                    </button>
                    <button
                        onClick={() => { setPrimaryTab('bookmarks'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-4 py-2 transition-all h-[40px] min-w-[140px] shrink-0 border-r border-slate-200 dark:border-slate-800 ${currentView === 'feed' && primaryTab === 'bookmarks'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/50'}`}
                    >
                        <Bookmark size={14} className={currentView === 'feed' && primaryTab === 'bookmarks' ? 'text-indigo-500' : 'text-slate-400'} /> 
                        <span className="text-[12px]">Bookmarks</span>
                    </button>
                    {tabs.map(t => (
                        <div
                            key={t.id}
                            className={`flex min-w-[160px] max-w-[240px] shrink-0 items-center justify-between px-4 h-[40px] border-r border-slate-200 dark:border-slate-800 transition-all ${currentView === 'reader' && activeTabId === t.id
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold'
                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/50'}`}
                        >
                            <button
                                onClick={() => { app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                                className="truncate text-[12px] flex-1 text-left"
                            >
                                {t.story.title}
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                                className="ml-2 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                <main 
                    className="flex-1 overflow-hidden bg-white dark:bg-slate-950 flex flex-col" 
                    style={{ display: currentView === 'feed' ? 'flex' : 'none' }}
                >
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Feed Specific Toolbar */}
                        {primaryTab === 'feed' && (
                            <div className="px-6 py-2.5 border-b border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 flex items-center justify-between gap-6 shrink-0 z-10">
                                <div className="flex items-center gap-4 overflow-x-auto no-scrollbar flex-1">
                                    <div className="flex items-center gap-2 shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Topics</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {activeTopics.filter(t => !disabledTopics.includes(t)).map(t => {
                                            const style = getTagStyle(t);
                                            return (
                                                <div
                                                    key={`feed-active-${t}`}
                                                    onClick={() => setDisabledTopics(prev => [...prev, t])}
                                                    className="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold border cursor-pointer hover:shadow-md transition-all group"
                                                    style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
                                                >
                                                    <span>#{t}</span>
                                                    <X size={10} onClick={(e) => { e.stopPropagation(); setActiveTopics(prev => prev.filter(x => x !== t)); }} className="text-slate-400 hover:text-red-500 transition-colors" />
                                                </div>
                                            );
                                        })}
                                        {activeTopics.filter(t => disabledTopics.includes(t)).map(t => (
                                            <div
                                                key={`feed-inactive-${t}`}
                                                onClick={() => setDisabledTopics(prev => prev.filter(x => x !== t))}
                                                className="px-3 py-1 rounded-full text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-400 opacity-60 cursor-pointer hover:opacity-100 transition-all"
                                            >
                                                #{t}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    {activeTopics.length > 0 && (
                                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 p-1 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
                                            <button 
                                                onClick={() => {
                                                    const allActive = activeTopics.filter(t => !disabledTopics.includes(t));
                                                    if (allActive.length > 0) {
                                                        setDisabledTopics([...new Set([...disabledTopics, ...allActive])]);
                                                    } else {
                                                        setDisabledTopics([]); 
                                                    }
                                                }}
                                                className="text-[9px] font-black uppercase px-2.5 py-1.5 rounded-md text-slate-500 hover:bg-white dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-all"
                                            >
                                                Mute
                                            </button>
                                            <button 
                                                onClick={() => { setActiveTopics([]); setDisabledTopics([]); }}
                                                className="text-[9px] font-black uppercase px-2.5 py-1.5 rounded-md text-red-400 hover:bg-white dark:hover:bg-slate-800 hover:text-red-600 transition-all"
                                            >
                                                Clear
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center bg-slate-50 dark:bg-slate-900 px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 group focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/50 transition-all shadow-sm">
                                        <Search size={13} className="text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Quick filter..."
                                            className="bg-transparent border-none outline-none text-[11px] font-semibold ml-2 w-28 focus:w-48 transition-all placeholder:text-slate-400"
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
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-white dark:bg-slate-950">
                            {loading && <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-indigo-500 mx-auto" /></div>}
                            {!loading && (
                                <div className="flex-1 flex flex-col min-h-full pb-8">
                                    {stories.length === 0 ? (
                                        <div className="flex-1 flex items-center justify-center p-20 text-slate-400 font-medium">No stories found in this view.</div>
                                    ) : (
                                        stories.slice(0, PAGE_SIZE).map((story, index) => {
                                            const isSelected = selectedStoryId === story.id;
                                            const isHighlighted = app.highlightedStoryId === story.id;
                                            const isRead = readIds.has(story.id) || !!story.is_read;
                                            return (
                                                <div key={story.id} ref={el => storyRefs.current[index] = el}
                                                    className="px-4 py-1"
                                                    onClick={() => setHighlightedStoryId(story.id)}
                                                    onDoubleClick={() => handleStorySelect(story.id, 'split')}
                                                >
                                                    <StoryCard
                                                        story={story} index={offset + index} isSelected={isSelected} isHighlighted={isHighlighted} isRead={isRead} isEven={index % 2 === 0}
                                                        onSelect={() => setHighlightedStoryId(story.id)}
                                                        onOpenInTab={handleStorySelect}
                                                        onToggleSave={user ? handleToggleSave : undefined} onHide={handleHideStory}
                                                        activeTopics={activeTopics}
                                                    />
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                                            )}
                        </div>

                        {/* Pagination - Floating Style */}
                        {totalStories > PAGE_SIZE && !loading && (
                            <div className="py-2.5 px-6 border-t border-slate-100 dark:border-slate-900 flex items-center justify-center gap-1 shrink-0 bg-white dark:bg-slate-950 z-20">
                                <button 
                                    onClick={() => setOffset?.(Math.max(0, offset - PAGE_SIZE))} 
                                    disabled={offset === 0} 
                                    className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 transition-all"
                                >
                                    &lt; Previous
                                </button>
                                
                                <div className="flex items-center gap-1 mx-4">
                                    {(() => {
                                        const totalPages = Math.ceil(totalStories / PAGE_SIZE);
                                        const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
                                        const pages = [];
                                        
                                        const maxButtons = 5;
                                        let start = Math.max(1, currentPage - 2);
                                        let end = Math.min(totalPages, start + maxButtons - 1);
                                        if (end === totalPages) start = Math.max(1, end - maxButtons + 1);

                                        if (start > 1) {
                                            pages.push(1);
                                            if (start > 2) pages.push('...');
                                        }

                                        for (let i = start; i <= end; i++) pages.push(i);

                                        if (end < totalPages) {
                                            if (end < totalPages - 1) pages.push('...');
                                            pages.push(totalPages);
                                        }

                                        return pages.map((p, idx) => {
                                            if (p === '...') return <span key={`dots-${idx}`} className="px-1 text-slate-300 text-xs">...</span>;
                                            const isActive = p === currentPage;
                                            return (
                                                <button
                                                    key={`page-${p}`}
                                                    onClick={() => setOffset?.((Number(p) - 1) * PAGE_SIZE)}
                                                    className={`w-8 h-8 flex items-center justify-center rounded-full text-[11px] font-bold transition-all ${isActive 
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                                                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}
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
                                    className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-30 transition-all"
                                >
                                    Next &gt;
                                </button>
                            </div>
                        )}

                    </div>
                </main>

                {/* Reader View */}
                <div 
                    className="flex-1 w-full bg-[#111d2e] relative"
                    style={{ display: currentView === 'reader' ? 'block' : 'none' }}
                >
                    {tabs.map(tab => (
                        <div key={tab.id} style={{ display: activeTabId === tab.id ? 'block' : 'none' }} className="h-full">
                            <ReaderPane
                                story={tab.story}
                                isActive={activeTabId === tab.id}
                                activeTab={(tab.mode || 'split') as any}
                                onTabChange={(m) => app.handleStorySelect?.(tab.storyId, m)}
                                onBack={app.handleBack}
                                onHome={app.handleHome}
                                onToggleAISidebar={(open) => app.toggleAISidebar(tab.id, open)}
                                user={user}
                                onHide={(id) => { handleHideStory(id); app.handleHome(); }}
                                onSetGlobalWarning={app.setGlobalWarning}
                                onSetIframeBlocked={app.setStoryIframeBlocked}
                                onOpenSettings={() => setIsSettingsOpen(true)}
                                isAISidebarOpen={tab.isAISidebarOpen || false}
                            />
                        </div>
                    ))}
                    {!tabs.length && <div className="h-full flex items-center justify-center text-slate-500">Select a story</div>}
                </div>

                {/* Always-on AI Topic Sidebar (needed only in Feed view) */}
                {currentView === 'feed' && (
                    <FilterSidebar
                        activeTopics={activeTopics}
                        setActiveTopics={setActiveTopics}
                        disabledTopics={app.disabledTopics}
                        setDisabledTopics={app.setDisabledTopics}
                        highlightedStory={highlightedStory}
                        user={user}
                        onSummarize={app.handleSummarizeStory}
                    />
                )}
            </div>

            {/* Modals */}
            {isAdminModalOpen && <AdminDashboard onClose={() => setIsAdminModalOpen(false)} />}
            {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />}
            <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

            {/* Status Bar */}
            <StatusBar />
        </div>
    );
}
