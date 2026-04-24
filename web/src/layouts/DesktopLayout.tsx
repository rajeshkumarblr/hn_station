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
    const VERSION = "1.0.0-rc14";
    const PAGE_SIZE = 10;
    const isElectron = getIsElectron();

    // Resolve the story object for the highlighted (keyboard/hovered) card
    const highlightedStory = stories.find(s => s.id === highlightedStoryId) ?? null;

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
            fetchWithAuth(`${baseUrl}/api/stories/${highlightedStoryId}/interact`, {
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
            {/* ─── Zen Header ─── */}
            <header 
                className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-[48px] flex items-center justify-between px-4 shrink-0 z-[100] relative select-none"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                {/* Left Section: Modes */}
                <div className="flex items-center h-full gap-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <nav className="h-full flex items-center gap-4">
                        {MODES.map((m) => {
                            const isActiveInPrimary = (primaryTab === 'feed' && m.key === mode) || (primaryTab === 'bookmarks' && m.key === 'saved');
                            const isSelected = isActiveInPrimary;
                            
                            return (
                                <button
                                    key={m.key}
                                    onClick={() => {
                                        if (m.key === 'saved') {
                                            setPrimaryTab('bookmarks');
                                        } else {
                                            setPrimaryTab('feed');
                                            if (mode === m.key && primaryTab === 'feed') handleRefresh();
                                            else { setMode(m.key as any); setOffset?.(0); }
                                        }
                                        setCurrentView('feed');
                                    }}
                                    className={`text-xs font-bold transition-all outline-none py-1 border-b-2 ${isSelected
                                        ? 'text-blue-600 border-blue-600'
                                        : 'text-slate-500 border-transparent hover:text-slate-800 dark:hover:text-white'
                                        }`}
                                >
                                    {m.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Center Branding: Absolute Centered */}
                <div 
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none"
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                >
                    <span className="text-[11px] font-black tracking-widest text-[#ff6600] uppercase leading-none drop-shadow-sm">HN Station</span>
                    <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 opacity-50 leading-tight">v1.0.0-rc17</span>
                </div>

                    {/* Right Section: Controls */}
                    <div className="flex items-center gap-2 h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

                        <button 
                            onClick={() => setIsSettingsOpen(true)} 
                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors" 
                            title="Settings"
                        >
                            <Settings size={16} />
                        </button>

                    {/* Window Controls - Tight Windows Style */}
                    {isElectron && (
                        <div className="flex items-center ml-2 border-l border-slate-200 dark:border-slate-700 pl-1 h-full">
                            <button
                                onClick={() => (window as any).electronAPI?.minimize()}
                                className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span className="text-sm">─</span>
                            </button>
                            <button
                                onClick={() => (window as any).electronAPI?.maximize()}
                                className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span className="text-[10px] border border-current px-0.5">□</span>
                            </button>
                            <button
                                onClick={() => (window as any).electronAPI?.close()}
                                className="w-10 h-full flex items-center justify-center text-slate-400 hover:bg-red-500 hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Global Tab Bar Container (Neutral Theme - Flush) */}
            {tabs.length > 0 && (
                <div className="flex bg-slate-100 dark:bg-slate-800 overflow-hidden border-b border-slate-200 dark:border-slate-700 shrink-0 gap-0">
                    <button
                        onClick={() => { setPrimaryTab('feed'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-6 py-2 rounded-t-lg border-x border-t transition-all h-[44px] relative -mb-[1px] ${currentView === 'feed' && primaryTab === 'feed'
                            ? 'bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 border-x-slate-200 dark:border-x-slate-700 border-t-2 border-t-blue-500 border-b-slate-50 dark:border-b-slate-950 shadow-[0_-2px_8px_rgba(0,0,0,0.1)] z-10'
                            : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold self-end border-b-0'}`}
                    >
                        <Home size={14} /> <span className="text-[12px] font-bold tracking-tight uppercase">Feed</span>
                        <div 
                            onClick={(e) => { e.stopPropagation(); handleRefreshTab('feed'); }}
                            className={`ml-2 p-1 rounded-md transition-all ${currentView === 'feed' && primaryTab === 'feed' ? 'opacity-100 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            title="Refresh Feed"
                        >
                            <RefreshCw size={12} className={loading && currentView === 'feed' && primaryTab === 'feed' ? "animate-spin" : ""} />
                        </div>
                    </button>

                    <button
                        onClick={() => { setPrimaryTab('bookmarks'); setCurrentView('feed'); }}
                        className={`group flex items-center justify-center gap-2 px-6 py-2 rounded-t-lg border-x border-t transition-all h-[44px] relative -mb-[1px] ${currentView === 'feed' && primaryTab === 'bookmarks'
                            ? 'bg-slate-50 dark:bg-slate-950 text-blue-600 dark:text-blue-400 border-x-slate-200 dark:border-x-slate-700 border-t-2 border-t-blue-500 border-b-slate-50 dark:border-b-slate-950 shadow-[0_-2px_8px_rgba(0,0,0,0.1)] z-10'
                            : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold self-end border-b-0'}`}
                    >
                        <Bookmark size={14} /> <span className="text-[12px] font-bold tracking-tight uppercase">Bookmarks</span>
                        <div className="flex items-center gap-1 ml-2">
                            <div 
                                onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                                className={`p-1 rounded-md transition-all ${currentView === 'feed' && primaryTab === 'bookmarks' ? 'opacity-100 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                title="Refresh Bookmarks"
                            >
                                <RefreshCw size={12} className={loading && currentView === 'feed' && primaryTab === 'bookmarks' ? "animate-spin" : ""} />
                            </div>
                            <div 
                                onClick={(e) => { e.stopPropagation(); setCurrentView('feed'); setPrimaryTab('feed'); }}
                                className={`p-1 rounded-md transition-all ${currentView === 'feed' && primaryTab === 'bookmarks' ? 'opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                                title="Close Bookmarks"
                            >
                                <X size={12} />
                            </div>
                        </div>
                    </button>
                    {tabs.map(t => {
                        const isActive = currentView === 'reader' && activeTabId === t.id;
                        let domain = 'news.ycombinator.com';
                        try {
                            if (t.story.url) domain = new URL(t.story.url).hostname;
                        } catch (e) {
                            console.error('Invalid URL in tab:', t.story.url);
                        }
                        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

                        return (
                            <div
                                key={t.id}
                                className={`flex flex-1 min-w-[40px] max-w-[200px] flex-col items-start rounded-t-lg border-x border-t relative group transition-all h-[44px] -mb-[1px] ${isActive
                                    ? 'bg-white dark:bg-[#111d2e] text-blue-600 dark:text-blue-400 border-x-slate-200 dark:border-x-slate-700 border-t-2 border-t-blue-500 border-b-white dark:border-b-[#111d2e] shadow-[0_-2px_10px_rgba(0,0,0,0.15)] z-10'
                                    : 'bg-transparent border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 self-end border-b-0'}`}
                            >
                                <button
                                    onClick={() => { app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                                    className="w-full h-full flex items-center gap-2 px-3 overflow-hidden min-w-0 text-left"
                                    title={`Click to switch tab: ${t.story.title}`}
                                >
                                    <img src={faviconUrl} alt="" className="w-3 h-3 rounded-sm flex-shrink-0" />
                                    <span className={`truncate text-[12px] font-black tracking-tight select-none ${isActive ? 'opacity-100 text-blue-600 dark:text-blue-400' : 'opacity-80 text-slate-500 dark:text-slate-400'}`}>
                                        {t.story.title}
                                    </span>
                                </button>
                                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <div 
                                        onClick={(e) => { e.stopPropagation(); handleRefreshTab(t.id); }} 
                                        className={`p-1 rounded-md transition-all cursor-pointer ${isActive ? 'text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800' : 'text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                        title="Refresh Tab"
                                    >
                                        <RefreshCw size={10} />
                                    </div>
                                    <div 
                                        onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} 
                                        className={`p-1 rounded-md transition-all cursor-pointer ${isActive ? 'text-slate-400 hover:text-white hover:bg-red-500' : 'text-slate-500 dark:text-slate-400 hover:text-white hover:bg-red-500'}`}
                                        title="Close Tab"
                                    >
                                        <X size={10} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Feed View Container - Persistent Mount */}
                <main 
                    className="flex-1 overflow-hidden bg-slate-50 dark:bg-slate-950 flex focus:outline-none" 
                    tabIndex={-1}
                    style={{ display: currentView === 'feed' ? 'flex' : 'none' }}
                >
                    <div className="flex w-full h-full relative">
                        <div className="flex-1 flex flex-col h-full overflow-hidden">
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
                                    {loading && <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-blue-500" /></div>}
                                    {!loading && (
                                        <div className="flex-1 flex flex-col h-full gap-0 overflow-y-auto custom-scrollbar">
                                            {(() => {
                                                const unfiltered = stories.filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden));
                                                const filtered = unfiltered.slice(0, PAGE_SIZE);

                                                if (filtered.length === 0) {
                                                    const stats = app.backendStats;
                                                    const hasData = stats && (stats.total_stories > 0);
                                                    
                                                    return (
                                                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                                                            <div className="max-w-md bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
                                                                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                                                                    <RefreshCw size={32} className={loading ? "animate-spin" : ""} />
                                                                </div>
                                                                <h3 className="text-xl font-bold mb-2">
                                                                    {app.error ? "Connection Issue" : (hasData ? "No Matching Stories" : "Initializing Feed...")}
                                                                </h3>
                                                                <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                                                                    {app.error 
                                                                        ? app.error 
                                                                        : activeTopics.length > 0 
                                                                            ? "No stories match your current filters. Try clearing them to see all content."
                                                                            : !hasData 
                                                                                ? "The local database is currently empty. The ingestion service is fetching stories from Hacker News right now."
                                                                                : "Your database is ready, but no stories are currently visible with your current view settings."}
                                                                </p>

                                                                {stats && (
                                                                    <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 text-left">
                                                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Database Stats</div>
                                                                        <div className="grid grid-cols-2 gap-4 text-xs">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-slate-500 dark:text-slate-500 font-medium">Stories</span>
                                                                                <span className="font-bold text-blue-500">{stats.total_stories.toLocaleString()}</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-slate-500 dark:text-slate-500 font-medium">Comments</span>
                                                                                <span className="font-bold text-emerald-500">{stats.total_comments.toLocaleString()}</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <div className="flex flex-col gap-3">
                                                                    {activeTopics.length > 0 && (
                                                                        <button 
                                                                            onClick={() => setActiveTopics([])}
                                                                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20"
                                                                        >
                                                                            Clear All Filters
                                                                        </button>
                                                                    )}
                                                                    <button 
                                                                        onClick={handleRefresh}
                                                                        className="px-6 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-white rounded-xl text-xs font-bold transition-all"
                                                                    >
                                                                        Refresh & Retry
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return filtered.map((story, index) => {
                                                    const isSelected = selectedStoryId === story.id;
                                                    const isHighlighted = app.highlightedStoryId === story.id;
                                                    const isRead = readIds.has(story.id) || !!story.is_read;
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
                                                                story={story} index={offset + index} isSelected={isSelected} isHighlighted={isHighlighted} isRead={isRead} isEven={index % 2 === 0}
                                                                titleColorStyle={tagStyle?.color} topicTextClass={null} onSelect={() => setHighlightedStoryId(story.id)}
                                                                onOpenInTab={(id, mode) => handleStorySelect(id, mode)}
                                                                onToggleSave={user ? handleToggleSave : undefined} onHide={handleHideStory}
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
                                highlightedStory={highlightedStory}
                            />
                        </div>
                    </main>

                    {/* Reader View Container - Persistent Mount */}
                    <div 
                        className="flex-1 w-full bg-[#111d2e] flex flex-col relative"
                        style={{ display: currentView === 'reader' ? 'flex' : 'none' }}
                    >
                        {tabs.map(tab => {
                            const isActiveTab = activeTabId === tab.id;
                            const isShowing = isActiveTab && currentView === 'reader';
                            const activeMode = tab.mode || 'split';
                            return (
                                <div
                                    key={tab.id}
                                    className="absolute inset-0"
                                    style={{ display: isActiveTab ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}
                                >
                                    <ReaderPane
                                        story={tab.story}
                                        isActive={isShowing}
                                        activeTab={activeMode as any}
                                        onTabChange={(m) => {
                                            app.handleStorySelect?.(tab.storyId, m);
                                        }}
                                        isAISidebarOpen={tab.isAISidebarOpen || false}
                                        onToggleAISidebar={(open) => app.toggleAISidebar(tab.id, open)}
                                        onBack={app.handleBack}
                                        onHome={app.handleHome}
                                        onTakeFocus={() => { }}
                                        onToggleSave={user ? handleToggleSave : undefined}
                                        onHide={(id) => { handleHideStory(id); app.handleHome(); }}
                                        onSetGlobalWarning={app.setGlobalWarning}
                                        onSetIframeBlocked={app.setStoryIframeBlocked}
                                        user={user}
                                        onOpenSettings={() => setIsSettingsOpen(true)}
                                    />
                                </div>
                            );
                        })}
                        {(!tabs.length || !selectedStory) && (
                            <div className="h-full flex items-center justify-center text-slate-500">Select a story</div>
                        )}
                    </div>
                {isAdminModalOpen && <AdminDashboard onClose={() => setIsAdminModalOpen(false)} />}
                {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />}
                <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
            </div>

            {/* Status Bar */}
            <div className="h-6 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center shrink-0 z-50">
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter shrink-0">Context:</span>
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 truncate">
                        {app.globalWarning ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 animate-pulse">
                                <span className="p-0.5 bg-amber-100 dark:bg-amber-900/40 rounded">⚠️</span>
                                {app.globalWarning}
                            </span>
                        ) : (
                            currentView === 'reader' && selectedStory ? selectedStory.title : (highlightedStory ? highlightedStory.title : 'HN Station Feed')
                        )}
                    </span>
                </div>
                <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${user?.authenticated ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></div>
                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Mode: {user?.authenticated ? 'Local Database' : 'Disconnected'}
                            </span>
                        </div>
                        <div className="w-[1px] h-3 bg-slate-200 dark:border-slate-800"></div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {currentView === 'feed' ? `Page ${Math.floor(offset / PAGE_SIZE) + 1}` : 'Reader View'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
