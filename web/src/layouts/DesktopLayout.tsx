import { useRef, useState, useEffect, useCallback } from 'react';
import pkg from '../../package.json';
import { RefreshCw, Home, Bookmark, Settings, X, Search, Layout, Zap, ChevronDown, Download } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getTagStyle } from '../utils/colors';
import { ReaderPane } from '../components/ReaderPane';
import { FilterSidebar } from '../components/FilterSidebar';
import { AdminDashboard } from '../components/AdminDashboard';
import { SettingsModal } from '../components/SettingsModal';
import { useGlobalKeyboardNav } from '../hooks/useGlobalKeyboardNav';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';
import { StatusBar } from '../components/StatusBar';
import { MODES } from '../types';
import { isElectron as getIsElectron, isWebPreview } from '../utils/env';
import { fetchWithAuth } from '../utils/api';

export function DesktopLayout({ app }: { app: ReturnType<typeof import('../hooks/useAppState').useAppState> }) {
    const {
        loading, mode, activeTopics,
        tabs, activeTabId,
        currentView, isAdminModalOpen, user,
        hasMore,
        selectedStoryId, stories,
        highlightedStoryId, isSettingsOpen,
        setMode, setActiveTopics,
        setCurrentView, setIsAdminModalOpen, setIsSettingsOpen,
        handleRefresh, closeTab, handleHideStory,
        handleStorySelect, handleToggleSave,
        readIds, setReadIds, setHighlightedStoryId,
        primaryTab, setPrimaryTab,
        disabledTopics, setDisabledTopics,
        fetchNextPage, fetchingMore,
    } = app;
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isArticlesMenuOpen, setIsArticlesMenuOpen] = useState(false);
    const articlesMenuRef = useRef<HTMLDivElement>(null);
    
    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (articlesMenuRef.current && !articlesMenuRef.current.contains(event.target as Node)) {
                setIsArticlesMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const isElectron = getIsElectron();

    // --- Sidebar Resizing State ---
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('hn_feed_sidebar_width');
        if (saved) return parseInt(saved, 10);
        return isWebPreview() ? Math.round(window.innerWidth * 0.7) : 320;
    });
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        return localStorage.getItem('hn_feed_sidebar_collapsed') === 'true';
    });
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<number | null>(null);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        if (resizeRef.current) {
            cancelAnimationFrame(resizeRef.current);
            resizeRef.current = null;
        }
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        if (resizeRef.current) cancelAnimationFrame(resizeRef.current);
        
        resizeRef.current = requestAnimationFrame(() => {
            const newWidth = window.innerWidth - e.clientX;
            // Snap to collapse
            if (newWidth < 100) {
                setIsSidebarCollapsed(true);
                localStorage.setItem('hn_feed_sidebar_collapsed', 'true');
                setIsResizing(false);
            } else {
                const minW = isWebPreview() ? Math.round(window.innerWidth * 0.3) : 200;
                const maxW = isWebPreview() ? Math.round(window.innerWidth * 0.8) : 600;
                const clampedWidth = Math.min(Math.max(newWidth, minW), maxW);
                setSidebarWidth(clampedWidth);
                setIsSidebarCollapsed(false);
                localStorage.setItem('hn_feed_sidebar_width', clampedWidth.toString());
                localStorage.setItem('hn_feed_sidebar_collapsed', 'false');
            }
        });
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: stories.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 120, // Estimated height of a StoryCard
        overscan: 5,
    });

    const virtualItems = virtualizer.getVirtualItems();

    // Trigger infinite scroll when nearing the end
    useEffect(() => {
        const lastItem = virtualItems[virtualItems.length - 1];
        if (!lastItem) return;

        if (lastItem.index >= stories.length - 1 && hasMore && !fetchingMore && !loading) {
            fetchNextPage();
        }
    }, [virtualItems, stories.length, hasMore, fetchingMore, loading, fetchNextPage]);

    // Resolve the story object for the highlighted (keyboard/hovered) card
    const highlightedStory = stories.find(s => s.id === highlightedStoryId) ?? null;

    useGlobalKeyboardNav(app, (index) => virtualizer.scrollToIndex(index, { align: 'center' }));

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
                                            const modeKey = m.key as any;
                                            // Update lastFeedMode BEFORE primaryTab change to prevent stale restore
                                            app.setLastFeedMode(modeKey);
                                            setPrimaryTab('feed');
                                            if (mode === modeKey && primaryTab === 'feed') handleRefresh();
                                            else { setMode(modeKey); }
                                        }
                                        setCurrentView('feed');
                                    }}
                                    className={`text-[11px] font-bold tracking-tight transition-all outline-none px-3 py-1.5 rounded-full relative group ${isSelected
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                        : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                >
                                    {m.label}
                                    {isSelected && (
                                        <div className="absolute -bottom-[14px] left-1/2 -translate-x-1/2 w-4 h-1 bg-orange-500 rounded-full" />
                                    )}
                                </button>
                            );
                        })}

                        {/* Articles Dropdown Menu (Relocated from Tab Bar) */}
                        <div className="relative h-full flex items-center ml-1" ref={articlesMenuRef}>
                            <button
                                onClick={() => setIsArticlesMenuOpen(!isArticlesMenuOpen)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border ${
                                    isArticlesMenuOpen 
                                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg' 
                                    : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white border-transparent'
                                }`}
                            >
                                <span>Articles</span>
                                <div className="flex items-center justify-center bg-black/10 dark:bg-white/10 rounded-full w-4 h-4 text-[9px]">
                                    {tabs.length}
                                </div>
                                <ChevronDown size={12} className={`transition-transform duration-200 ${isArticlesMenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isArticlesMenuOpen && (
                                <div className="absolute left-0 top-[48px] w-[320px] max-h-[400px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[200] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150">
                                    <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Open Articles</span>
                                        <span className="text-[10px] font-bold text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">{tabs.length}</span>
                                    </div>
                                    <div className="overflow-y-auto max-h-[350px] custom-scrollbar p-1">
                                        {tabs.map((t) => (
                                            <button
                                                key={`menu-${t.id}`}
                                                onClick={() => {
                                                    app.handleStorySelect?.(t.storyId);
                                                    setCurrentView('reader');
                                                    setIsArticlesMenuOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-3 p-3 text-left rounded-lg transition-colors group ${
                                                    activeTabId === t.id && currentView === 'reader'
                                                    ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' 
                                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                                                }`}
                                            >
                                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTabId === t.id && currentView === 'reader' ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700 group-hover:bg-slate-400'}`} />
                                                <span className="text-[12px] font-medium truncate flex-1">{t.story.title}</span>
                                            </button>
                                        ))}
                                        {tabs.length === 0 && (
                                            <div className="p-8 text-center text-slate-400 text-[12px]">No open articles</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </nav>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
                </div>

                {/* Center Branding */}
                <div 
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none hidden lg:flex"
                    style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                        <span className="text-[13px] font-black tracking-[0.2em] bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent uppercase leading-none">HN Station</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] font-bold text-blue-500 dark:text-blue-400/80 mt-0.5 tracking-normal lowercase">v{pkg.version}</span>
                            <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[7px] font-black px-1 py-0.5 rounded ml-0.5 tracking-widest uppercase border border-orange-500/20">BETA</span>
                        </div>
                    </div>
                </div>

                {/* Right Section: Controls */}
                <div className="flex items-center gap-1.5 h-full shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded-full mr-2 hidden md:flex">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Live Ingest</span>
                    </div>
                    {!isElectron && (
                        <a
                            href="https://github.com/rajeshkumarblr/hn_station/releases/latest"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[10px] font-black rounded-full shadow-sm hover:shadow-lg transition-all uppercase tracking-wider shrink-0 active:scale-[0.98] mr-1"
                            title="Get Desktop App"
                        >
                            <Download size={11} />
                            Get App
                        </a>
                    )}
                    <button 
                        onClick={() => setIsSettingsOpen(true)} 
                        className="p-2 rounded-full hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors" 
                        title="Application Settings"
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

            {/* Global Filters Toolbar (swapped with Web Preview Banner) */}
            {currentView === 'feed' && (
                <div className="h-[56px] flex items-center justify-between px-6 gap-4 z-[99] bg-white dark:bg-[#0c1222] border-b border-slate-200 dark:border-slate-800/80 shrink-0 select-none">
                    {/* Left Fixed Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                        <button 
                            onClick={app.handleRefresh} 
                            className="p-2 rounded-xl text-slate-500 hover:text-indigo-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all shrink-0 border border-slate-200 dark:border-slate-800 bg-white dark:bg-black/20 shadow-sm"
                            title="Refresh stories from Hacker News"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-500' : ''} />
                        </button>

                        <div className="flex items-center bg-slate-100 dark:bg-black/40 px-4 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/50 group focus-within:ring-2 focus-within:ring-indigo-500/45 focus-within:border-indigo-500/50 transition-all shadow-inner shrink-0" title="Quickly filter stories in the current list">
                            <Search size={13} className="text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                            <input
                                type="text"
                                placeholder="Quick filter..."
                                value={app.searchQuery}
                                onChange={(e) => app.setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && app.searchQuery.trim()) {
                                        let term = app.searchQuery.trim();
                                        if (term.startsWith('#')) term = term.slice(1);
                                        const tag = term.charAt(0).toUpperCase() + term.slice(1);
                                        
                                        // Add to topics if not there
                                        if (!activeTopics.includes(tag)) {
                                            setActiveTopics(prev => [...prev, tag]);
                                        }
                                        
                                        // EXCLUSIVE: Enable ONLY this tag, disable all others
                                        setDisabledTopics(activeTopics.filter(t => t !== tag));
                                        
                                        app.setSearchQuery('');
                                        (e.target as HTMLInputElement).blur();
                                    } else if (e.key === 'Escape') {
                                        app.setSearchQuery('');
                                        (e.target as HTMLInputElement).blur();
                                    }
                                }}
                                className="bg-transparent border-none outline-none text-[11px] font-bold ml-2 w-32 focus:w-48 transition-all placeholder:text-slate-500 dark:placeholder:text-slate-600 text-slate-800 dark:text-slate-200"
                            />
                        </div>
                    </div>

                    {/* Center Scrollable Tags */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                            {/* Pinned #All Tag - Styled uniquely as a green global reset */}
                            <div
                                onClick={() => {
                                    setDisabledTopics([...activeTopics]);
                                    app.setSearchQuery('');
                                }}
                                className={`flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-black border cursor-pointer hover:shadow-md transition-all group shrink-0 ${
                                    activeTopics.filter(t => !disabledTopics.includes(t)).length === 0
                                        ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/20' 
                                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                                }`}
                            >
                                <Zap size={10} className={activeTopics.filter(t => !disabledTopics.includes(t)).length === 0 ? "text-emerald-500" : "text-slate-600"} />
                                <span>#ALL</span>
                            </div>

                            {activeTopics.map(t => {
                                    const isActive = !disabledTopics.includes(t);
                                    const style = getTagStyle(t);
                                    
                                    return (
                                        <div
                                            key={`feed-tag-${t}`}
                                            onClick={() => {
                                                const noActiveTags = activeTopics.filter(x => !disabledTopics.includes(x)).length === 0;
                                                
                                                if (app.topicMatch === 'exclusive') {
                                                    if (isActive) {
                                                        // Deselecting the only active tag returns to #ALL
                                                        setDisabledTopics(activeTopics);
                                                    } else {
                                                        // Select ONLY this tag, disable all others
                                                        setDisabledTopics(activeTopics.filter(x => x !== t));
                                                    }
                                                    return;
                                                }

                                                if (noActiveTags) {
                                                    // If #All was active, select ONLY this tag
                                                    setDisabledTopics(activeTopics.filter(x => x !== t));
                                                } else {
                                                    // Toggle this tag (multi-select for Any/Both modes)
                                                    if (isActive) {
                                                        setDisabledTopics(prev => [...prev, t]);
                                                    } else {
                                                        setDisabledTopics(prev => prev.filter(x => x !== t));
                                                    }
                                                }
                                            }}
                                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold border cursor-pointer hover:shadow-md transition-all group shrink-0 ${!isActive && 'opacity-50 hover:opacity-100 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'}`}
                                            style={isActive ? { backgroundColor: `${style.bg}`, color: style.color, borderColor: style.border } : {}}
                                        >
                                            <span>#{t}</span>
                                            <X size={10} onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setActiveTopics(prev => prev.filter(x => x !== t));
                                                setDisabledTopics(prev => prev.filter(x => x !== t));
                                            }} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all cursor-pointer" />
                                        </div>
                                    );
                                })}
                        </div>
                    </div>

                    {/* Right Toolbar Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-2 mr-1">
                            <div className="flex items-center bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5 text-[9px] font-black uppercase tracking-tighter shadow-inner" title="Topic Search Mode: Any = match any tag, All = match all tags, Excl = exclusive single-tag mode">
                                <button 
                                    onClick={() => app.setTopicMatch('any')}
                                    title="Show stories that contain ANY of the selected topics"
                                    className={`px-2 py-1 rounded-md transition-all ${app.topicMatch === 'any' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Any
                                </button>
                                <button 
                                    onClick={() => app.setTopicMatch('all')}
                                    title="Show stories that contain ALL selected topics (AND logic)"
                                    className={`px-2 py-1 rounded-md transition-all ${app.topicMatch === 'all' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    All
                                </button>
                                <button 
                                    onClick={() => app.setTopicMatch('exclusive')}
                                    title="Exclusive mode: Selecting a topic clears others"
                                    className={`px-2 py-1 rounded-md transition-all ${app.topicMatch === 'exclusive' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                >
                                    Excl
                                </button>
                            </div>
                        </div>

                        <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

                        <button 
                            onClick={() => {
                                const newState = !isSidebarCollapsed;
                                setIsSidebarCollapsed(newState);
                                localStorage.setItem('hn_feed_sidebar_collapsed', newState.toString());
                            }}
                            className={`p-2 rounded-lg transition-all border ${isSidebarCollapsed ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400'}`}
                            title={isSidebarCollapsed ? "Expand Sidebar (Ctrl+Q)" : "Collapse Sidebar (Ctrl+Q)"}
                        >
                            <Layout size={16} className={isSidebarCollapsed ? 'opacity-40' : 'opacity-100'} />
                        </button>
                    </div>
                </div>
            )}


            {/* Global Tab Bar Container */}
            {tabs.length > 0 && !isWebPreview() && (
                <div className="flex items-center bg-slate-50 dark:bg-[#020617] border-b border-slate-200 dark:border-slate-800 shrink-0 relative">
                    <div className="flex flex-1 min-w-0 overflow-hidden gap-px">
                        <button
                            onClick={() => { setPrimaryTab('feed'); setCurrentView('feed'); }}
                            title="Go to main news feed"
                            className={`group flex items-center justify-center gap-2 px-4 py-2 transition-all h-[40px] min-w-[120px] max-w-[160px] flex-1 shrink-0 border-r border-slate-200 dark:border-slate-800 ${currentView === 'feed' && primaryTab === 'feed'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold'
                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/50'}`}
                        >
                            <Home size={14} className={currentView === 'feed' && primaryTab === 'feed' ? 'text-indigo-500' : 'text-slate-400'} /> 
                            <span className="text-[12px] truncate">Feed</span>
                        </button>
                        <button
                            onClick={() => { setPrimaryTab('bookmarks'); setCurrentView('feed'); }}
                            title="View your saved stories"
                            className={`group flex items-center justify-center gap-2 px-4 py-2 transition-all h-[40px] min-w-[120px] max-w-[160px] flex-1 shrink-0 border-r border-slate-200 dark:border-slate-800 ${currentView === 'feed' && primaryTab === 'bookmarks'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 font-bold'
                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900/50'}`}
                        >
                            <Bookmark size={14} className={currentView === 'feed' && primaryTab === 'bookmarks' ? 'text-indigo-500' : 'text-slate-400'} /> 
                            <span className="text-[12px] truncate">Bookmarks</span>
                        </button>
                        {tabs.map(t => (
                            <div
                                key={t.id}
                                title={t.story.title}
                                className={`flex min-w-[60px] max-w-[240px] flex-1 shrink items-center justify-between px-3 h-[40px] border-r border-slate-200 dark:border-slate-800 transition-all ${currentView === 'reader' && activeTabId === t.id
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
                                    className="ml-1 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500 transition-colors shrink-0"
                                >
                                    <X size={10} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                <main 
                    className="flex-1 overflow-hidden bg-slate-50 dark:bg-[#0c1222] flex flex-col" 
                    style={{ display: currentView === 'feed' ? 'flex' : 'none' }}
                >
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                        <div 
                            ref={parentRef}
                            className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#f8fafc] dark:bg-[#080c14]"
                        >
                            {loading && stories.length === 0 ? (
                                <div className="p-20 text-center"><RefreshCw size={32} className="animate-spin text-indigo-500 mx-auto" /></div>
                            ) : (
                                <div 
                                    className="relative w-full"
                                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                                >
                                    {virtualItems.map((virtualItem) => {
                                        const story = stories[virtualItem.index];
                                        if (!story) return null;

                                        const isSelected = selectedStoryId === story.id;
                                        const isHighlighted = app.highlightedStoryId === story.id;
                                        const isRead = readIds.has(story.id) || !!story.is_read;

                                        return (
                                            <div
                                                key={story.id}
                                                data-index={virtualItem.index}
                                                ref={virtualizer.measureElement}
                                                className="absolute top-0 left-0 w-full px-6 py-2.5"
                                                style={{
                                                    transform: `translateY(${virtualItem.start}px)`,
                                                }}
                                                onClick={() => setHighlightedStoryId(story.id)}
                                                onDoubleClick={() => handleStorySelect(story.id, 'split')}
                                            >
                                                <StoryCard
                                                    story={story} 
                                                    index={virtualItem.index} 
                                                    isSelected={isSelected} 
                                                    isHighlighted={isHighlighted} 
                                                    isRead={isRead} 
                                                    isEven={virtualItem.index % 2 === 0}
                                                    onSelect={() => setHighlightedStoryId(story.id)}
                                                    onOpenInTab={handleStorySelect}
                                                    onToggleSave={(isWebPreview() || user) ? handleToggleSave : undefined} 
                                                    onHide={handleHideStory}
                                                    activeTopics={activeTopics}
                                                    selectedTopics={activeTopics.filter(t => !disabledTopics.includes(t))}
                                                    topicMatch={app.topicMatch}
                                                />
                                            </div>
                                        );
                                    })}
                                    
                                    {/* Loading more spinner at the end of the list */}
                                    {fetchingMore && (
                                        <div 
                                            className="absolute left-0 w-full flex justify-center py-8"
                                            style={{ transform: `translateY(${virtualizer.getTotalSize()}px)` }}
                                        >
                                            <RefreshCw size={24} className="animate-spin text-indigo-500/50" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {!loading && stories.length === 0 && (
                                <div className="flex-1 flex items-center justify-center p-20 text-slate-400 font-medium">No stories found in this view.</div>
                            )}
                        </div>
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
                                onHome={app.handleHome}
                                onClose={() => closeTab(tab.id)}
                                onToggleAISidebar={(open) => app.toggleAISidebar(tab.id, open)}
                                onToggleSave={handleToggleSave}
                                user={user}
                                onHide={(id) => { handleHideStory(id); app.handleHome(); }}
                                onSetGlobalWarning={app.setGlobalWarning}
                                onSetIframeBlocked={app.setStoryIframeBlocked}
                                onSummarizeStory={app.handleSummarizeStory}
                                onOpenSettings={() => setIsSettingsOpen(true)}
                                isAISidebarOpen={tab.isAISidebarOpen || false}
                                activeTopics={activeTopics}
                                disabledTopics={disabledTopics}
                                setActiveTopics={setActiveTopics}
                                setDisabledTopics={setDisabledTopics}
                                topicMatch={app.topicMatch}
                            />
                        </div>
                    ))}
                    {!tabs.length && <div className="h-full flex items-center justify-center text-slate-500">Select a story</div>}
                </div>

                {/* Right Side Workspace Pane (Comments & AI Takeaways in Web, FilterSidebar in Desktop) */}
                {isWebPreview() ? (
                    <>
                        {/* Resizer Handle */}
                        {!isSidebarCollapsed && (
                            <div
                                onMouseDown={startResizing}
                                className={`w-1.5 h-full cursor-col-resize absolute right-0 top-0 z-50 hover:bg-indigo-500/30 transition-colors ${isResizing ? 'bg-indigo-500/50' : ''}`}
                                style={{ right: `${sidebarWidth}px` }}
                            />
                        )}

                        <div 
                            className={`h-full transition-all duration-300 ease-in-out overflow-hidden flex shrink-0 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
                            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                        >
                            {highlightedStory ? (
                                <div className="flex-1 h-full overflow-hidden flex flex-col bg-white dark:bg-[#0b0f19]">
                                    <ReaderPane
                                        story={highlightedStory}
                                        isActive={true}
                                        activeTab="discussion"
                                        onTabChange={() => {}}
                                        onHome={app.handleHome}
                                        onClose={() => {}}
                                        onToggleAISidebar={() => {}}
                                        onToggleSave={handleToggleSave}
                                        user={user}
                                        onHide={(id) => { handleHideStory(id); }}
                                        onSetGlobalWarning={app.setGlobalWarning}
                                        onSetIframeBlocked={app.setStoryIframeBlocked}
                                        onSummarizeStory={app.handleSummarizeStory}
                                        onOpenSettings={() => setIsSettingsOpen(true)}
                                        isAISidebarOpen={true}
                                        activeTopics={activeTopics}
                                        disabledTopics={disabledTopics}
                                        setActiveTopics={setActiveTopics}
                                        setDisabledTopics={setDisabledTopics}
                                        topicMatch={app.topicMatch}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 dark:bg-[#0a0f1d] text-slate-400 dark:text-slate-500 gap-4 h-full">
                                    <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shadow-xl shadow-indigo-500/5">
                                        <Layout size={28} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">Select a story</h3>
                                        <p className="text-[11px] text-slate-500 max-w-[240px] leading-relaxed">
                                            Single-click any story in the feed to view community discussion & AI summaries here. Double-click to read.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    currentView === 'feed' && (
                        <>
                            {/* Resizer Handle */}
                            {!isSidebarCollapsed && (
                                <div
                                    onMouseDown={startResizing}
                                    className={`w-1.5 h-full cursor-col-resize absolute right-0 top-0 z-50 hover:bg-indigo-500/30 transition-colors ${isResizing ? 'bg-indigo-500/50' : ''}`}
                                    style={{ right: `${sidebarWidth}px` }}
                                />
                            )}

                            <div 
                                className={`h-full transition-all duration-300 ease-in-out overflow-hidden flex shrink-0 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
                                style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                            >
                                <FilterSidebar
                                    activeTopics={activeTopics}
                                    setActiveTopics={setActiveTopics}
                                    disabledTopics={app.disabledTopics}
                                    setDisabledTopics={app.setDisabledTopics}
                                    highlightedStory={highlightedStory}
                                    user={user}
                                    onSummarize={app.handleSummarizeStory}
                                    topicMatch={app.topicMatch}
                                />
                            </div>
                        </>
                    )
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
