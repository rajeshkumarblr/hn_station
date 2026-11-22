import { useRef, useState, useEffect, useCallback } from 'react';
import { RefreshCw, Home, Settings, X, Search, PanelRight, ChevronDown, Download, Sun, Moon, Github, Pin, Play, Layers, List } from 'lucide-react';
import { StoryCard } from '../components/StoryCard';
import { GroupedFeed } from '../components/GroupedFeed';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ReaderPane } from '../components/ReaderPane';
import { FilterSidebar } from '../components/FilterSidebar';
import { AdminDashboard } from '../components/AdminDashboard';
import { SettingsModal } from '../components/SettingsModal';
import { useGlobalKeyboardNav } from '../hooks/useGlobalKeyboardNav';
import { KeyboardHelpModal } from '../components/KeyboardHelpModal';
import { BriefingDeck, type BriefingStage } from '../components/BriefingDeck';
import { HeaderSyncStatus } from '../components/StatusBar';
import { MODES, type Story } from '../types';
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
        theme, toggleTheme,
    } = app;
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [isArticlesMenuOpen, setIsArticlesMenuOpen] = useState(false);
    const articlesMenuRef = useRef<HTMLDivElement>(null);

    // Slideshow overlay state (opt-in via Slideshow button; feed view is always default)
    const [isBriefingOpen, setIsBriefingOpen] = useState<boolean>(false);
    const [briefingStage, setBriefingStage] = useState<BriefingStage>('postgres');

    // Feed layout mode: Topic-Grouped (default on All) vs flat ranked List
    const [feedViewMode, setFeedViewMode] = useState<'grouped' | 'list'>(() => {
        try {
            const saved = localStorage.getItem('hn_feed_view_mode');
            if (saved === 'list' || saved === 'grouped') return saved;
        } catch { }
        return 'grouped';
    });
    const [groupedRefreshKey, setGroupedRefreshKey] = useState(0);
    const [highlightedStoryOverride, setHighlightedStoryOverride] = useState<Story | null>(null);

    const hasActiveTopicFilter = activeTopics.some(t => !disabledTopics.includes(t));
    const isGroupedActive =
        !isWebPreview() &&
        feedViewMode === 'grouped' &&
        primaryTab === 'feed' &&
        (mode === 'default' || mode === 'latest' || mode === 'votes') &&
        !hasActiveTopicFilter &&
        app.searchQuery.trim() === '';

    const handleSetFeedViewMode = useCallback((next: 'grouped' | 'list') => {
        setFeedViewMode(next);
        try { localStorage.setItem('hn_feed_view_mode', next); } catch { }
        if (next === 'grouped') {
            setDisabledTopics([...activeTopics]);
            app.setSearchQuery('');
            setPrimaryTab('feed');
        }
    }, [activeTopics, setDisabledTopics, app, setPrimaryTab]);

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
        if (saved) return Math.max(parseInt(saved, 10), 280);
        return isWebPreview() ? Math.round(window.innerWidth * 0.7) : 400;
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
            if (newWidth < 120) {
                setIsSidebarCollapsed(true);
                localStorage.setItem('hn_feed_sidebar_collapsed', 'true');
                setIsResizing(false);
            } else {
                const minW = isWebPreview() ? Math.round(window.innerWidth * 0.3) : 280;
                const maxW = isWebPreview() ? Math.round(window.innerWidth * 0.8) : 640;
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

    // OS-aware installer download logic (web preview only)
    const { downloadUrl, downloadLabel, isDesktopOS } = (() => {
        const userAgent = typeof window !== 'undefined' ? window.navigator.userAgent : '';
        const platform = typeof window !== 'undefined' ? (window.navigator.platform || '') : '';

        let os: 'Windows' | 'macOS' | 'Linux' | 'mobile' | 'unknown' = 'unknown';

        if (/Mac|Macintosh|MacIntel|MacPPC|Mac68K/.test(platform) || /Macintosh|Mac OS X/.test(userAgent)) {
            os = 'macOS';
        } else if (/Win|Win32|Win64|Windows|WinCE/.test(platform) || /Windows/.test(userAgent)) {
            os = 'Windows';
        } else if (/Android|iPhone|iPad|iPod/.test(userAgent) || /iPhone|iPad|iPod/.test(platform)) {
            os = 'mobile';
        } else if (/Linux/.test(platform) || /Linux/.test(userAgent)) {
            os = 'Linux';
        }

        let url = 'https://github.com/rajeshkumarblr/hn_station';
        let label = 'Get Desktop App';
        const isDesktop = os === 'Windows' || os === 'macOS' || os === 'Linux';

        if (os === 'Windows') {
            url = 'https://github.com/rajeshkumarblr/hn_station/releases/download/v0.10.0/HN.Station.Setup.0.10.0.exe';
            label = 'Get for Windows';
        } else if (os === 'macOS') {
            url = 'https://github.com/rajeshkumarblr/hn_station/releases/download/v0.10.0/HN.Station-0.10.0-arm64.dmg';
            label = 'Get for macOS';
        } else if (os === 'Linux') {
            url = 'https://github.com/rajeshkumarblr/hn_station/releases/download/v0.10.0/hn-station_0.10.0_amd64.deb';
            label = 'Get for Linux';
        }

        return { downloadUrl: url, downloadLabel: label, isDesktopOS: isDesktop };
    })();

    const parentRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        count: stories.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => isWebPreview() ? 76 : 96,
        overscan: 6,
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

    // Resolve the story object for the highlighted (keyboard/hovered) row
    const highlightedStory =
        stories.find(s => s.id === highlightedStoryId) ??
        (highlightedStoryOverride && highlightedStoryOverride.id === highlightedStoryId ? highlightedStoryOverride : null);

    useGlobalKeyboardNav(app, (index) => virtualizer.scrollToIndex(index, { align: 'center' }));

    useEffect(() => {
        if (!isGroupedActive && !loading && stories.length > 0) {
            const hasHighlighted = stories.some(s => s.id === highlightedStoryId);
            if (!hasHighlighted) {
                setHighlightedStoryId(stories[0].id);
            }
        }
    }, [stories, loading, highlightedStoryId, isGroupedActive]);

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

    const getTopicMatchCount = (topic: string) => {
        const lower = topic.toLowerCase();
        return app.storyBuffer.filter(s => {
            if (s.title?.toLowerCase().includes(lower)) return true;
            if (s.topics?.some(st => st?.toLowerCase() === lower)) return true;
            return false;
        }).length;
    };

    const noActiveTopics = activeTopics.filter(t => !disabledTopics.includes(t)).length === 0;

    return (
        <div className="h-screen bg-[#fafaf8] dark:bg-[#121214] text-stone-900 dark:text-[#ececef] font-sans overflow-hidden flex flex-col">
            {/* ─── Primary Header (Slim, Calm, Native Mac Feel) ─── */}
            <header className="bg-[#fafaf8] dark:bg-[#17171a] border-b border-stone-200/80 dark:border-white/[0.07] h-[44px] flex items-center justify-between px-4 shrink-0 z-[100] relative select-none">
                {/* Left Section: Navigation */}
                <div className="flex items-center h-full gap-2 flex-1 min-w-0">
                    <nav className="h-full flex items-center gap-0.5 shrink-0">
                        {MODES.map((m) => {
                            const isSelected = (primaryTab === 'feed' && m.key === mode) || (primaryTab === 'bookmarks' && m.key === 'saved');
                            return (
                                <button
                                    key={m.key}
                                    onClick={() => {
                                        if (m.key === 'saved') setPrimaryTab('bookmarks');
                                        else {
                                            const modeKey = m.key as any;
                                            app.setLastFeedMode(modeKey);
                                            setPrimaryTab('feed');
                                            if (mode === modeKey && primaryTab === 'feed') handleRefresh();
                                            else { setMode(modeKey); }
                                        }
                                        setCurrentView('feed');
                                    }}
                                    className={`text-[12.5px] transition-colors outline-none px-2.5 py-1 rounded-md cursor-pointer ${
                                        isSelected
                                            ? 'bg-stone-200/80 dark:bg-white/[0.1] text-stone-950 dark:text-white font-medium'
                                            : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/40 dark:hover:bg-white/[0.05]'
                                    }`}
                                >
                                    {m.label}
                                </button>
                            );
                        })}

                        {/* Open Articles Dropdown (only shown when tabs are open) */}
                        {!isWebPreview() && tabs.length > 0 && (
                            <div className="relative h-full flex items-center ml-1" ref={articlesMenuRef}>
                                <button
                                    onClick={() => setIsArticlesMenuOpen(!isArticlesMenuOpen)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12.5px] transition-colors cursor-pointer ${
                                        isArticlesMenuOpen
                                            ? 'bg-stone-200 dark:bg-white/[0.12] text-stone-950 dark:text-white font-medium'
                                            : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/40 dark:hover:bg-white/[0.05]'
                                    }`}
                                >
                                    <span>Open</span>
                                    <span className="text-[11px] text-stone-400 dark:text-zinc-500 tabular-nums">
                                        {tabs.length}
                                    </span>
                                    <ChevronDown size={12} className={`opacity-60 transition-transform duration-150 ${isArticlesMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {isArticlesMenuOpen && (
                                    <div className="absolute left-0 top-[42px] w-[320px] max-h-[400px] bg-white dark:bg-[#1c1c20] border border-stone-200 dark:border-zinc-800 rounded-lg shadow-xl z-[200] overflow-hidden flex flex-col">
                                        <div className="px-3 py-2 border-b border-stone-200/80 dark:border-white/[0.07] flex items-center justify-between">
                                            <span className="text-[11.5px] font-medium text-stone-500 dark:text-zinc-400">Open articles</span>
                                            <span className="text-[11px] text-stone-400 dark:text-zinc-500 tabular-nums">{tabs.length}</span>
                                        </div>
                                        <div className="overflow-y-auto max-h-[350px] custom-scrollbar p-1">
                                            {tabs.map((t) => (
                                                <button
                                                    key={`menu-${t.id}`}
                                                    onClick={() => {
                                                        setIsBriefingOpen(false);
                                                        app.handleStorySelect?.(t.storyId);
                                                        setCurrentView('reader');
                                                        setIsArticlesMenuOpen(false);
                                                    }}
                                                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-md transition-colors cursor-pointer ${
                                                        activeTabId === t.id && currentView === 'reader'
                                                            ? 'bg-stone-100 dark:bg-white/[0.08] text-stone-900 dark:text-white font-medium'
                                                            : 'hover:bg-stone-100/80 dark:hover:bg-white/[0.05] text-stone-600 dark:text-zinc-300'
                                                    }`}
                                                >
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeTabId === t.id && currentView === 'reader' ? 'bg-[#e06834]' : 'bg-stone-300 dark:bg-zinc-600'}`} />
                                                    <span className="text-[12.5px] truncate flex-1">{t.story.title}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="h-3.5 w-px bg-stone-200 dark:bg-white/[0.08] mx-1.5" />

                        {/* Quiet Opt-in Slideshow Button */}
                        <button
                            onClick={() => {
                                setBriefingStage('postgres');
                                setIsBriefingOpen(true);
                            }}
                            title="Open Slideshow (Top 5 Postgres & Top 5 LLM/AI)"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12.5px] text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/40 dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                            <Play size={10} className="fill-current opacity-75" />
                            <span>Slideshow</span>
                        </button>
                    </nav>

                    {/* Inline Filter toolbar for web preview */}
                    {isWebPreview() && (
                        <>
                            <div className="h-4 w-px bg-stone-200 dark:bg-white/[0.08] mx-1 shrink-0" />
                            <button
                                onClick={app.handleRefresh}
                                className="p-1.5 rounded-md text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/50 dark:hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
                                title="Refresh stories"
                            >
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            </button>

                            <div className="flex items-center bg-stone-200/50 dark:bg-white/[0.05] px-2.5 py-1 rounded-md border border-transparent focus-within:border-stone-300 dark:focus-within:border-zinc-700 transition-colors shrink-0">
                                <Search size={12} className="text-stone-400 dark:text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Filter..."
                                    value={app.searchQuery}
                                    onChange={(e) => app.setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && app.searchQuery.trim()) {
                                            let term = app.searchQuery.trim();
                                            if (term.startsWith('#')) term = term.slice(1);
                                            const tag = term.charAt(0).toUpperCase() + term.slice(1);
                                            if (!activeTopics.includes(tag)) {
                                                setActiveTopics(prev => [...prev, tag]);
                                            }
                                            setDisabledTopics(activeTopics.filter(t => t !== tag));
                                            app.setSearchQuery('');
                                            (e.target as HTMLInputElement).blur();
                                        } else if (e.key === 'Escape') {
                                            app.setSearchQuery('');
                                            (e.target as HTMLInputElement).blur();
                                        }
                                    }}
                                    className="bg-transparent border-none outline-none text-[12px] ml-1.5 w-24 focus:w-36 transition-all placeholder:text-stone-400 dark:placeholder:text-zinc-500 text-stone-800 dark:text-zinc-100"
                                />
                                {app.searchQuery && (
                                    <button
                                        onClick={() => app.setSearchQuery('')}
                                        className="ml-1 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
                                        title="Clear filter"
                                    >
                                        <X size={10} />
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Right Section: Quiet Activity + Theme + Settings */}
                <div className="flex items-center gap-1 h-full shrink-0">
                    <HeaderSyncStatus />

                    {!isElectron && isWebPreview() && (
                        <a
                            href="https://github.com/rajeshkumarblr/hn_station"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/50 dark:hover:bg-white/[0.06] transition-colors mr-1"
                            title="View source code on GitHub"
                        >
                            <Github size={13} />
                            <span className="hidden sm:inline">GitHub</span>
                        </a>
                    )}
                    {!isElectron && isDesktopOS && (
                        <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[11.5px] font-medium rounded-md transition-opacity hover:opacity-90 shrink-0 mr-1"
                        >
                            <Download size={11} />
                            {downloadLabel}
                        </a>
                    )}
                    <button
                        onClick={toggleTheme}
                        className="p-1.5 rounded-md hover:bg-stone-200/60 dark:hover:bg-white/[0.07] text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                    >
                        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                    </button>
                    <button
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-1.5 rounded-md hover:bg-stone-200/60 dark:hover:bg-white/[0.07] text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                        title="Settings"
                    >
                        <Settings size={15} />
                    </button>
                </div>
            </header>

            {/* ─── Secondary Filter Strip (Slim & Monochrome) — Feed View Only ─── */}
            {currentView === 'feed' && !isWebPreview() && (
                <div className="h-[42px] flex items-center justify-between px-4 gap-3 z-[99] bg-[#fafaf8] dark:bg-[#141416] border-b border-stone-200/75 dark:border-white/[0.06] shrink-0 select-none">
                    {/* Left: Refresh + Minimal Search */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => {
                                app.handleRefresh();
                                setGroupedRefreshKey(k => k + 1);
                            }}
                            className="p-1.5 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer"
                            title="Refresh stories"
                        >
                            <RefreshCw size={13} className={loading ? 'animate-spin text-[#e06834]' : ''} />
                        </button>

                        <div
                            className="flex items-center bg-stone-200/50 dark:bg-white/[0.05] px-2.5 py-1 rounded-md border border-transparent focus-within:border-stone-300 dark:focus-within:border-zinc-700 transition-colors shrink-0"
                            title="Filter stories or press Enter to add a topic"
                        >
                            <Search size={12} className="text-stone-400 dark:text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Filter or +topic..."
                                value={app.searchQuery}
                                onChange={(e) => app.setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && app.searchQuery.trim()) {
                                        let term = app.searchQuery.trim();
                                        if (term.startsWith('#')) term = term.slice(1);
                                        const tag = term.charAt(0).toUpperCase() + term.slice(1);

                                        if (!activeTopics.includes(tag)) {
                                            setActiveTopics(prev => [...prev, tag]);
                                        }
                                        setDisabledTopics(activeTopics.filter(t => t !== tag));

                                        app.setSearchQuery('');
                                        (e.target as HTMLInputElement).blur();
                                    } else if (e.key === 'Escape') {
                                        app.setSearchQuery('');
                                        (e.target as HTMLInputElement).blur();
                                    }
                                }}
                                className="bg-transparent border-none outline-none text-[12px] ml-2 w-32 focus:w-48 transition-all placeholder:text-stone-400 dark:placeholder:text-zinc-500 text-stone-800 dark:text-zinc-100"
                            />
                            {app.searchQuery && (
                                <button
                                    onClick={() => app.setSearchQuery('')}
                                    className="ml-1 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 cursor-pointer"
                                    title="Clear filter"
                                >
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Center: Monochrome Topic Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
                        <button
                            onClick={() => {
                                setDisabledTopics([...activeTopics]);
                                app.setSearchQuery('');
                            }}
                            className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer shrink-0 ${
                                noActiveTopics
                                    ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/60 dark:hover:bg-white/[0.06]'
                            }`}
                        >
                            All
                        </button>

                        {activeTopics.map(t => {
                            const isActive = !disabledTopics.includes(t);
                            const matchCount = getTopicMatchCount(t);

                            return (
                                <div
                                    key={`feed-tag-${t}`}
                                    onClick={() => {
                                        const noActiveTags = activeTopics.filter(x => !disabledTopics.includes(x)).length === 0;

                                        if (app.topicMatch === 'exclusive') {
                                            if (isActive) {
                                                setDisabledTopics(activeTopics);
                                            } else {
                                                setDisabledTopics(activeTopics.filter(x => x !== t));
                                            }
                                            return;
                                        }

                                        if (noActiveTags) {
                                            setDisabledTopics(activeTopics.filter(x => x !== t));
                                        } else if (isActive) {
                                            setDisabledTopics(prev => [...prev, t]);
                                        } else {
                                            setDisabledTopics(prev => prev.filter(x => x !== t));
                                        }
                                    }}
                                    className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium cursor-pointer transition-colors shrink-0 ${
                                        isActive
                                            ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                            : 'bg-stone-200/50 dark:bg-white/[0.04] text-stone-600 dark:text-zinc-400 hover:bg-stone-200/80 dark:hover:bg-white/[0.08] hover:text-stone-900 dark:hover:text-zinc-200'
                                    }`}
                                >
                                    <span>{t}</span>
                                    {matchCount > 0 && (
                                        <span className={`text-[10.5px] tabular-nums ${isActive ? 'opacity-65' : 'text-stone-400 dark:text-zinc-500'}`}>
                                            {matchCount}
                                        </span>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveTopics(prev => prev.filter(x => x !== t));
                                            setDisabledTopics(prev => prev.filter(x => x !== t));
                                        }}
                                        title={`Remove ${t}`}
                                        className={`opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity cursor-pointer shrink-0 -mr-0.5 ${
                                            isActive ? 'text-white dark:text-zinc-900' : 'text-stone-400 dark:text-zinc-500'
                                        }`}
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Right: Topics / List Segmented Control + Preview Pane Toggle */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-stone-200/60 dark:bg-white/[0.05] rounded-md p-0.5 text-[11.5px] font-medium">
                            <button
                                onClick={() => handleSetFeedViewMode('grouped')}
                                title="Group stories by topic"
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-colors cursor-pointer ${
                                    isGroupedActive
                                        ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 shadow-sm'
                                        : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                                }`}
                            >
                                <Layers size={11} />
                                <span>Topics</span>
                            </button>
                            <button
                                onClick={() => handleSetFeedViewMode('list')}
                                title="Flat list"
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-[5px] transition-colors cursor-pointer ${
                                    !isGroupedActive
                                        ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 shadow-sm'
                                        : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                                }`}
                            >
                                <List size={11} />
                                <span>List</span>
                            </button>
                        </div>

                        <button
                            onClick={() => {
                                const newState = !isSidebarCollapsed;
                                setIsSidebarCollapsed(newState);
                                localStorage.setItem('hn_feed_sidebar_collapsed', newState.toString());
                            }}
                            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                isSidebarCollapsed
                                    ? 'text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/60 dark:hover:bg-white/[0.06]'
                                    : 'bg-stone-200/80 dark:bg-white/[0.1] text-stone-800 dark:text-zinc-100'
                            }`}
                            title={isSidebarCollapsed ? 'Show Preview Pane (Ctrl+Q)' : 'Hide Preview Pane (Ctrl+Q)'}
                        >
                            <PanelRight size={15} />
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Slim Tab Bar (Only when article tabs are open) ─── */}
            {tabs.length > 0 && !isWebPreview() && (
                <div className="flex items-center bg-stone-100/90 dark:bg-[#121214] border-b border-stone-200/80 dark:border-white/[0.07] shrink-0 relative">
                    <div className="flex flex-1 min-w-0 overflow-hidden">
                        <button
                            onClick={() => { setPrimaryTab('feed'); setCurrentView('feed'); }}
                            title="Back to Feed"
                            className={`flex items-center justify-center gap-1.5 px-3.5 h-[34px] shrink-0 border-r border-stone-200/80 dark:border-white/[0.07] transition-colors cursor-pointer text-[12px] ${
                                currentView === 'feed'
                                    ? 'bg-[#fafaf8] dark:bg-[#19191d] text-stone-900 dark:text-zinc-100 font-medium border-b-2 border-b-[#e06834]'
                                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-white/[0.04]'
                            }`}
                        >
                            <Home size={13} />
                            <span>Feed</span>
                        </button>
                        {tabs.map(t => {
                            const isPinned = Boolean(t.isPinned);
                            const isActiveTab = currentView === 'reader' && activeTabId === t.id;
                            return (
                                <div
                                    key={t.id}
                                    title={isPinned
                                        ? `${t.story.title} (Pinned)`
                                        : `${t.story.title} (Double-click to pin tab)`}
                                    onDoubleClick={() => app.pinTab(t.id, true)}
                                    className={`group flex min-w-[100px] max-w-[260px] flex-1 shrink items-center justify-between px-3 h-[34px] border-r border-stone-200/80 dark:border-white/[0.07] transition-colors select-none ${
                                        isActiveTab
                                            ? 'bg-[#fafaf8] dark:bg-[#19191d] text-stone-900 dark:text-zinc-100 font-medium border-b-2 border-b-[#e06834]'
                                            : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200 hover:bg-stone-200/50 dark:hover:bg-white/[0.04]'
                                    }`}
                                >
                                    <button
                                        onClick={() => { setIsBriefingOpen(false); app.handleStorySelect?.(t.storyId); setCurrentView('reader'); }}
                                        className={`truncate text-[12px] flex-1 text-left cursor-pointer ${!isPinned ? 'italic' : ''}`}
                                    >
                                        {t.story.title}
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); app.pinTab(t.id); }}
                                        title={isPinned ? 'Unpin tab' : 'Pin tab'}
                                        className={`ml-1 p-1 rounded transition-opacity shrink-0 cursor-pointer ${
                                            isPinned
                                                ? 'text-[#e06834]'
                                                : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 text-stone-400 dark:text-zinc-500'
                                        }`}
                                    >
                                        <Pin size={10} className={isPinned ? 'fill-current' : ''} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}
                                        title="Close tab"
                                        className="ml-0.5 p-1 rounded text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-200/70 dark:hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
                                    >
                                        <X size={11} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ─── Main Workspace ─── */}
            <div className="flex-1 flex overflow-hidden relative">
                <main
                    className="flex-1 overflow-hidden bg-[#fafaf8] dark:bg-[#121214] flex flex-col"
                    style={{ display: currentView === 'feed' ? 'flex' : 'none' }}
                >
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                        {isGroupedActive ? (
                            <GroupedFeed
                                apiBase={app.apiBase}
                                stories={stories}
                                selectedStoryId={selectedStoryId}
                                highlightedStoryId={app.highlightedStoryId}
                                readIds={readIds}
                                hiddenIds={app.hiddenStories}
                                activeTopics={activeTopics}
                                onSelectStory={(story) => {
                                    setHighlightedStoryOverride(story);
                                    setHighlightedStoryId(story.id);
                                }}
                                onOpenInTab={handleStorySelect}
                                onToggleSave={(isWebPreview() || user) ? handleToggleSave : undefined}
                                onHide={handleHideStory}
                                onFilterTopic={(topics) => {
                                    setActiveTopics(prev => {
                                        const next = [...prev];
                                        for (const t of topics) {
                                            if (!next.includes(t)) next.push(t);
                                        }
                                        setDisabledTopics(next.filter(x => !topics.includes(x)));
                                        return next;
                                    });
                                    app.setTopicMatch(topics.length > 1 ? 'any' : 'exclusive');
                                }}
                                refreshKey={groupedRefreshKey}
                            />
                        ) : (
                            <div
                                ref={parentRef}
                                className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#fafaf8] dark:bg-[#121214]"
                            >
                                {loading && stories.length === 0 ? (
                                    <div className="p-20 text-center">
                                        <RefreshCw size={22} className="animate-spin text-stone-400 dark:text-zinc-500 mx-auto" />
                                    </div>
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
                                                    className="absolute top-0 left-0 w-full"
                                                    style={{
                                                        transform: `translateY(${virtualItem.start}px)`,
                                                    }}
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
                                                        hiddenTags={activeTopics.filter(t => !disabledTopics.includes(t))}
                                                    />
                                                </div>
                                            );
                                        })}

                                        {fetchingMore && (
                                            <div
                                                className="absolute left-0 w-full flex justify-center py-8"
                                                style={{ transform: `translateY(${virtualizer.getTotalSize()}px)` }}
                                            >
                                                <RefreshCw size={18} className="animate-spin text-stone-400 dark:text-zinc-500" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!loading && stories.length === 0 && (
                                    <div className="flex-1 flex items-center justify-center p-20 text-[13px] text-stone-400 dark:text-zinc-500">
                                        No stories match this filter.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </main>

                {/* Reader View */}
                {currentView === 'reader' && (
                    <div className="flex-1 w-full bg-[#fafaf8] dark:bg-[#121214] relative">
                        {tabs.filter(tab => activeTabId === tab.id).map(tab => (
                            <div key={tab.id} className="h-full">
                                <ReaderPane
                                    story={tab.story}
                                    isActive={true}
                                    activeTab={(tab.mode || 'article') as any}
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
                                    isAISidebarOpen={tab.isAISidebarOpen ?? (tab.mode !== 'article')}
                                    activeTopics={activeTopics}
                                    disabledTopics={disabledTopics}
                                    setActiveTopics={setActiveTopics}
                                    setDisabledTopics={setDisabledTopics}
                                    topicMatch={app.topicMatch}
                                />
                            </div>
                        ))}
                        {!tabs.length && (
                            <div className="h-full flex items-center justify-center text-[13px] text-stone-400 dark:text-zinc-500">
                                Select a story
                            </div>
                        )}
                    </div>
                )}

                {/* Right Side Preview Pane */}
                {isWebPreview() ? (
                    <>
                        {!isSidebarCollapsed && (
                            <div
                                onMouseDown={startResizing}
                                className={`w-1 h-full cursor-col-resize absolute right-0 top-0 z-50 hover:bg-stone-400/40 dark:hover:bg-zinc-600/40 transition-colors ${isResizing ? 'bg-[#e06834]/50' : ''}`}
                                style={{ right: `${sidebarWidth}px` }}
                            />
                        )}

                        <div
                            className={`h-full transition-all duration-200 ease-out overflow-hidden flex shrink-0 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
                            style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                        >
                            {highlightedStory ? (
                                <div className="flex-1 h-full overflow-hidden flex flex-col bg-[#fafaf8] dark:bg-[#121214]">
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
                                <div className="flex-1 flex items-center justify-center text-center p-8 bg-[#f5f5f2] dark:bg-[#161619] text-stone-400 dark:text-zinc-500 h-full text-[13px]">
                                    Select a story to view discussion and summary.
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    currentView === 'feed' && (
                        <>
                            {!isSidebarCollapsed && (
                                <div
                                    onMouseDown={startResizing}
                                    className={`w-1 h-full cursor-col-resize absolute right-0 top-0 z-50 hover:bg-stone-400/40 dark:hover:bg-zinc-600/40 transition-colors ${isResizing ? 'bg-[#e06834]/50' : ''}`}
                                    style={{ right: `${sidebarWidth}px` }}
                                />
                            )}

                            <div
                                className={`h-full transition-all duration-200 ease-out overflow-hidden flex shrink-0 ${isSidebarCollapsed ? 'w-0 opacity-0' : 'opacity-100'}`}
                                style={{ width: isSidebarCollapsed ? 0 : `${sidebarWidth}px` }}
                            >
                                <FilterSidebar
                                    activeTopics={activeTopics}
                                    setActiveTopics={setActiveTopics}
                                    disabledTopics={app.disabledTopics}
                                    setDisabledTopics={app.setDisabledTopics}
                                    highlightedStory={highlightedStory}
                                    user={user}
                                    apiBase={app.apiBase}
                                    onOpenInTab={handleStorySelect}
                                    onSummarize={app.handleSummarizeStory}
                                    topicMatch={app.topicMatch}
                                />
                            </div>
                        </>
                    )
                )}
            </div>

            {/* Modals */}
            <BriefingDeck
                apiBase={app.apiBase}
                isOpen={isBriefingOpen}
                initialStage={briefingStage}
                onClose={() => setIsBriefingOpen(false)}
                onGoDeep={(storyId) => {
                    setIsBriefingOpen(false);
                    handleStorySelect(storyId, 'article');
                }}
                onSummarizeStory={app.handleSummarizeStory}
            />
            {isAdminModalOpen && <AdminDashboard onClose={() => setIsAdminModalOpen(false)} />}
            {isSettingsOpen && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} user={user} />}
            <KeyboardHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </div>
    );
}
