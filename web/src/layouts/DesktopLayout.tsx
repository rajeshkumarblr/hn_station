import { useRef, useState, useEffect } from 'react';
import { RefreshCw, Home, Bookmark, Settings, Shield, LogIn, LogOut, X, Search } from 'lucide-react';
import { StoryCard, getTagStyle } from '../components/StoryCard';
import { ReaderPane } from '../components/ReaderPane';
import { FilterSidebar } from '../components/FilterSidebar';
import { AdminDashboard } from '../components/AdminDashboard';
import { SettingsModal } from '../components/SettingsModal';
import { getStoryTopicMatch } from '../hooks/useAppState';
import { getApiBase } from '../utils/apiBase';
import { useGlobalKeyboardNav } from '../hooks/useGlobalKeyboardNav';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';
import { MODES } from '../types';
import { isElectron as getIsElectron } from '../utils/env';
import { fetchWithAuth } from '../utils/api';

export function DesktopLayout({ app }: { app: ReturnType<typeof import('../hooks/useAppState').useAppState> }) {
    const {
        loading, mode, activeTopics,
        tabs, activeTabId, showHidden,
        currentView, isAdminModalOpen, user,
        hiddenStories, offset, setOffset, totalStories, hasMore,
        selectedStoryId, selectedStory, stories,
        highlightedStoryId, isSettingsOpen,
        setMode, setActiveTopics,
        setCurrentView, setIsAdminModalOpen, setIsSettingsOpen,
        handleRefresh, handleRefreshTab, closeTab, handleHideStory,
        handleStorySelect, handleToggleSave,
        readIds, setReadIds, setHighlightedStoryId,
        primaryTab, setPrimaryTab,
        disabledTopics, setDisabledTopics,
    } = app;
    const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const VERSION = "1.0.0-rc35";
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
        <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">
            {/* ─── Zen Header ─── */}
            <header 
                className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-[48px] flex items-center justify-between px-4 shrink-0 z-[100] relative select-none"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                {/* Left Section: Modes & Global Filters */}
                <div className="flex items-center h-full gap-4 flex-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <nav className="h-full flex items-center gap-3 shrink-0">
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
                                    className={`text-[11px] font-bold transition-all outline-none px-2 py-1 rounded-md ${isSelected
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white'
                                        }`}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700 shrink-0" />
                    
                    <button
                        onClick={handleRefresh}
                        className={`p-2 rounded-lg text-slate-500 hover:text-blue-500 transition-all ${loading ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>

                {/* Center Branding */}
                <div 
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none hidden lg:flex"
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                >
                    <span className="text-[11px] font-black tracking-widest text-[#ff6600] uppercase leading-none drop-shadow-sm">HN Station</span>
                </div>

                {/* Right Section: Controls */}
                <div className="flex items-center gap-2 h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <button 
                        onClick={() => setIsSettingsOpen(true)} 
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors" 
                    >
                        <Settings size={16} />
                    </button>
                    {isElectron && (
                        <div className="flex items-center ml-2 border-l border-slate-200 dark:border-slate-700 pl-1 h-full">
                            <button onClick={() => (window as any).electronAPI?.minimize()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"><span className="text-sm">─</span></button>
                            <button onClick={() => (window as any).electronAPI?.maximize()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"><span className="text-[10px] border border-current px-0.5">□</span></button>
                            <button onClick={() => (window as any).electronAPI?.close()} className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white"><X size={14} /></button>
                        </div>
                    )}
                </div>
            </header>

            {/* Global Tab Bar Container */}
            {tabs.length > 0 && (
                <div className="flex bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-200 dark:border-slate-700 shrink-0 gap-0">
                    <button
                        onClick={() => { setPrimaryTab('feed'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-3 py-2 transition-all h-[44px] w-[120px] shrink-0 ${currentView === 'feed' && primaryTab === 'feed'
                            ? 'bg-slate-50 dark:bg-slate-950 text-blue-600 border-b-2 border-blue-500'
                            : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        <Home size={14} /> <span className="text-[12px] font-bold">Feed(Top)</span>
                    </button>
                    <button
                        onClick={() => { setPrimaryTab('bookmarks'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-3 py-2 transition-all h-[44px] w-[120px] shrink-0 ${currentView === 'feed' && primaryTab === 'bookmarks'
                            ? 'bg-slate-50 dark:bg-slate-950 text-blue-600 border-b-2 border-blue-500'
                            : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        <Bookmark size={14} /> <span className="text-[12px] font-bold">Bookmarks</span>
                    </button>
                    {tabs.map(t => (
                        <div
                            key={t.id}
                            className={`flex w-[120px] shrink-0 items-center justify-between px-3 h-[44px] border-r border-slate-200 dark:border-slate-700 ${currentView === 'reader' && activeTabId === t.id
                                ? 'bg-white dark:bg-[#111d2e] text-blue-600 border-b-2 border-blue-500'
                                : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        >
                            <button
                                onClick={() => { app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                                className="truncate text-[12px] font-bold flex-1"
                            >
                                {t.story.title}
                            </button>
                            <X size={12} className="cursor-pointer hover:text-red-500" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                <main 
                    className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col" 
                    style={{ display: currentView === 'feed' ? 'flex' : 'none' }}
                >
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Feed Specific Toolbar */}
                        {primaryTab === 'feed' && (
                            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] flex items-center justify-between gap-4 shrink-0 shadow-sm z-10">
                                <div className="flex items-center gap-3 overflow-x-auto no-scrollbar flex-1">
                                    <span className="text-[10px] font-black uppercase text-slate-400 shrink-0">Topics:</span>
                                    <div className="flex items-center gap-2">
                                        {activeTopics.filter(t => !disabledTopics.includes(t)).map(t => {
                                            const style = getTagStyle(t);
                                            return (
                                                <div
                                                    key={`feed-active-${t}`}
                                                    onClick={() => setDisabledTopics(prev => [...prev, t])}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border cursor-pointer hover:brightness-95 transition-all shadow-sm"
                                                    style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
                                                >
                                                    <span>#{t}</span>
                                                    <X size={10} onClick={(e) => { e.stopPropagation(); setActiveTopics(prev => prev.filter(x => x !== t)); }} className="hover:text-red-500" />
                                                </div>
                                            );
                                        })}
                                        {activeTopics.filter(t => disabledTopics.includes(t)).map(t => (
                                            <div
                                                key={`feed-inactive-${t}`}
                                                onClick={() => setDisabledTopics(prev => prev.filter(x => x !== t))}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 opacity-60 cursor-pointer hover:opacity-100 transition-all"
                                            >
                                                #{t}
                                            </div>
                                        ))}
                                    </div>
                                    
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {activeTopics.length > 0 && (
                                        <div className="flex items-center gap-2 mr-2">
                                            <button 
                                                onClick={() => {
                                                    const allActive = activeTopics.filter(t => !disabledTopics.includes(t));
                                                    if (allActive.length > 0) {
                                                        setDisabledTopics([...new Set([...disabledTopics, ...allActive])]);
                                                    } else {
                                                        setDisabledTopics([]); // If all are disabled, enable all? No, requester said "disable all"
                                                    }
                                                }}
                                                className="text-[9px] font-black uppercase px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                                            >
                                                Disable All
                                            </button>
                                            <button 
                                                onClick={() => { setActiveTopics([]); setDisabledTopics([]); }}
                                                className="text-[9px] font-black uppercase px-2 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all"
                                            >
                                                Remove All
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                        <Search size={12} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                                        <input
                                            type="text"
                                            placeholder="Add filter..."
                                            className="bg-transparent border-none outline-none text-[11px] font-bold ml-2 w-24 focus:w-40 transition-all placeholder:text-slate-400"
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
                                    
                                    <button
                                        onClick={handleRefresh}
                                        className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-blue-500 transition-all ${loading ? 'animate-spin' : ''}`}
                                    >
                                        <RefreshCw size={12} />
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                            {loading && <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-blue-500 mx-auto" /></div>}
                            {!loading && (
                                <div className="flex-1 flex flex-col min-h-full">
                                    {stories.length === 0 ? (
                                        <div className="flex-1 flex items-center justify-center p-20 text-slate-500">No stories found.</div>
                                    ) : (
                                        stories.slice(0, PAGE_SIZE).map((story, index) => {
                                            const isSelected = selectedStoryId === story.id;
                                            const isHighlighted = app.highlightedStoryId === story.id;
                                            const isRead = readIds.has(story.id) || !!story.is_read;
                                            return (
                                                <div key={story.id} ref={el => storyRefs.current[index] = el}
                                                    className="flex-1 flex flex-col min-h-[60px]"
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

                        {/* Pagination - Pinned to bottom, outside scroll area */}
                        {totalStories > PAGE_SIZE && !loading && (
                            <div className="py-1.5 px-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1 shrink-0 bg-white dark:bg-[#0f172a] shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-20">
                                <button 
                                    onClick={() => setOffset?.(Math.max(0, offset - PAGE_SIZE))} 
                                    disabled={offset === 0} 
                                    className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 transition-all font-sans"
                                >
                                    &lt; Prev
                                </button>
                                
                                <div className="flex items-center gap-1 mx-2">
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
                                            if (p === '...') return <span key={`dots-${idx}`} className="px-1 text-slate-400 text-xs">...</span>;
                                            const isActive = p === currentPage;
                                            return (
                                                <button
                                                    key={`page-${p}`}
                                                    onClick={() => setOffset?.((Number(p) - 1) * PAGE_SIZE)}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg text-[11px] font-bold transition-all ${isActive 
                                                        ? 'bg-blue-500 text-white shadow-sm' 
                                                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
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
                                    className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md disabled:opacity-30 transition-all font-sans"
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
            <div className="h-6 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center shrink-0 text-[10px] text-slate-500 font-bold">
                <span className="mr-4">CONTEXT: {currentView === 'feed' ? `Page ${Math.floor(offset / PAGE_SIZE) + 1}` : 'Reader View'}</span>
                <span>MODE: {user?.authenticated ? 'Local Database' : 'Disconnected'}</span>
                {app.globalWarning && <span className="ml-auto text-amber-500 animate-pulse">⚠️ {app.globalWarning}</span>}
            </div>
        </div>
    );
}
