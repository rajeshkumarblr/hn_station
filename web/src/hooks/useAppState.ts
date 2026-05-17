import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PAGE_SIZE, MAX_READ_IDS } from '../types';
import type { Story, ReaderTab, ModeKey, User } from '../types';
import { getApiBase, subscribeApiBase } from '../utils/apiBase';
import { isWebPreview, isElectron } from '../utils/env';
import { fetchWithAuth } from '../utils/api';
import { getClientAISettings, clientGenerateSummary } from '../utils/aiClient';



function loadReadIds(): Set<number> {
    try {
        const saved = localStorage.getItem('hn_read_stories');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return new Set(parsed.map(Number));
        }
    } catch { }
    return new Set();
}

function saveReadIds(ids: Set<number>) {
    const arr = Array.from(ids);
    const trimmed = arr.slice(-MAX_READ_IDS);
    localStorage.setItem('hn_read_stories', JSON.stringify(trimmed));
}

function loadTopicChips(): string[] {
    try {
        const saved = localStorage.getItem('hn_topic_chips');
        if (saved) return JSON.parse(saved);
    } catch { }
    return ['LLM', 'AI', 'Postgres', 'Database', 'Model'];
}

function saveTopicChips(chips: string[]) {
    try {
        localStorage.setItem('hn_topic_chips', JSON.stringify(chips));
    } catch { }
}

function loadPersistedTabs(): ReaderTab[] {
    try {
        const saved = localStorage.getItem('hn_desktop_tabs');
        if (saved) return JSON.parse(saved);
    } catch { }
    return [];
}

function loadPersistedActiveTabId(): string | null {
    try {
        return localStorage.getItem('hn_desktop_active_tab_id');
    } catch { }
    return null;
}

function loadPersistedCurrentView(): 'feed' | 'reader' | 'admin' {
    try {
        const view = localStorage.getItem('hn_desktop_current_view');
        if (view === 'feed' || view === 'reader' || view === 'admin') return view;
    } catch { }
    return 'feed';
}

export interface BackendStats {
    total_users: number;
    total_interactions: number;
    total_stories: number;
    total_comments: number;
}

export function getStoryTopicMatch(storyTitle: string | undefined, storyTopics: string[] | undefined, activeTopics: string[]): string | null {
    if (!storyTitle) return null;
    const titleLower = storyTitle.toLowerCase();
    for (const active of activeTopics) {
        const activeLower = active.toLowerCase();
        if (titleLower.includes(activeLower)) return active;
        if (storyTopics) {
            for (const t of storyTopics) {
                if (t && t.toLowerCase() === activeLower) return active;
            }
        }
    }
    return null;
}

export function useAppState() {
    const [storyBuffer, setStoryBuffer] = useState<Story[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [backendStats, setBackendStats] = useState<BackendStats | null>(null);
    const [apiBase, setApiBase] = useState(getApiBase());

    const [mode, setMode] = useState<ModeKey>('default');
    const [offset, setOffset] = useState(0);
    const [activeTopics, setActiveTopics] = useState<string[]>(loadTopicChips);
    const [searchQuery, setSearchQuery] = useState('');
    const [topicMatch, setTopicMatch] = useState<'any' | 'all' | 'exclusive'>('exclusive');
    const [disabledTopics, setDisabledTopics] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem('hn_disabled_topics');
            if (saved) return JSON.parse(saved);
        } catch { }
        return [];
    });
    const [totalStories, setTotalStories] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);

    const [hasMore, setHasMore] = useState(true);
    const [fetchingMore, setFetchingMore] = useState(false);

    const [readIds, setReadIds] = useState<Set<number>>(loadReadIds);
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
            return localStorage.getItem('theme') as 'dark' | 'light';
        }
        return 'dark';
    });

    const [highlightedStoryId, setHighlightedStoryId] = useState<number | null>(null);
    const [tabs, setTabs] = useState<ReaderTab[]>(loadPersistedTabs);
    const [activeTabId, setActiveTabId] = useState<string | null>(loadPersistedActiveTabId);

    const [showHidden, setShowHidden] = useState(false);
    const hiddenStories = new Set<number>();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'feed' | 'reader' | 'admin'>(loadPersistedCurrentView);
    const [isFilterActive, setIsFilterActive] = useState(() => {
        try {
            const saved = localStorage.getItem('hn_filter_active');
            return saved !== 'false'; // Default to true
        } catch { }
        return true;
    });
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [globalWarning, setGlobalWarning] = useState<string | null>(null);
    const lastPrioritizedIdsRef = useRef<string>('');

    // Primary Tab Management
    const [primaryTab, setPrimaryTab] = useState<'feed' | 'bookmarks'>(() => {
        const saved = localStorage.getItem('hn_desktop_primary_tab');
        return (saved === 'feed' || saved === 'bookmarks') ? saved : 'feed';
    });
    const [lastFeedMode, setLastFeedMode] = useState<ModeKey>(() => {
        const saved = localStorage.getItem('hn_desktop_last_feed_mode');
        return (saved && saved !== 'saved') ? (saved as ModeKey) : 'default';
    });

    const handleRefresh = () => setRefreshKey(prev => prev + 1);
    const handleRefreshTab = useCallback((tabId?: string) => {
        if (!tabId || tabId === 'feed') {
            handleRefresh();
            return;
        }

        // Find the tab to re-fetch its story data
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        const baseUrl = getApiBase();
        fetchWithAuth(`${baseUrl}/api/stories/${tab.storyId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data && data.story) {
                    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, story: data.story } : t));
                }
            })
            .catch(() => { });
    }, [tabs, handleRefresh]);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

    const closeTab = useCallback((tabId: string) => {
        setTabs(prev => {
            const newTabs = prev.filter(t => t.id !== tabId);
            if (activeTabId === tabId) {
                setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
                if (newTabs.length === 0) setCurrentView('feed');
            }
            return newTabs;
        });
    }, [activeTabId]);

    const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || null, [tabs, activeTabId]);

    const handleBack = useCallback(() => {
        if (activeTab?.parentTabId) {
            const parentExists = tabs.some(t => t.id === activeTab.parentTabId);
            if (parentExists) {
                setActiveTabId(activeTab.parentTabId);
                setCurrentView('reader');
                return;
            }
        }
        setCurrentView('feed');
    }, [activeTab, tabs]);

    const handleHome = useCallback(() => {
        setCurrentView('feed');
    }, []);

    const selectedStoryId = activeTab?.storyId || null;
    const selectedStory = activeTab?.story || null;
    const readerTab = activeTab?.mode || 'article';

    const updateTabMode = useCallback((tabId: string, m: 'article' | 'discussion' | 'split') => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, mode: m } : t));
    }, []);

    const setReaderTab = useCallback((m: 'article' | 'discussion' | 'split') => {
        if (!activeTabId) return;
        updateTabMode(activeTabId, m);
    }, [activeTabId, updateTabMode]);

    const setStoryIframeBlocked = useCallback((storyId: number, blocked: boolean) => {
        setStoryBuffer(prev => prev.map(s => s.id === storyId ? { ...s, iframe_blocked: blocked } : s));
        setTabs(prev => prev.map(t => t.storyId === storyId ? { ...t, story: { ...t.story, iframe_blocked: blocked } } : t));
    }, []);

    const setStoryDiscussionSummary = useCallback((storyId: number, summary: string) => {
        setStoryBuffer(prev => prev.map(s => s.id === storyId ? { ...s, discussion_summary: summary } : s));
        setTabs(prev => prev.map(t => t.storyId === storyId ? { ...t, story: { ...t.story, discussion_summary: summary } } : t));
    }, []);

    const toggleAISidebar = useCallback((tabId: string, open: boolean) => {
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isAISidebarOpen: open } : t));
    }, []);

    const stories = storyBuffer; // Backend already paginates this buffer

    useEffect(() => {
        return subscribeApiBase((url: string) => {
            setApiBase(url);
        });
    }, []);

    const isWebMode = isWebPreview();
    
    useEffect(() => {
        saveTopicChips(activeTopics);
    }, [activeTopics]);

    useEffect(() => {
        localStorage.setItem('hn_disabled_topics', JSON.stringify(disabledTopics));
    }, [disabledTopics]);

    useEffect(() => {
        // Wait for apiBase to be resolved in Electron to avoid 401 on fallback
        if (isElectron() && (!apiBase || apiBase.includes('hnstation.dev'))) {
            return;
        }

        // Auto-refresh polling (every 60s)
        const autoRefreshInterval = setInterval(() => {
            // Don't auto-refresh if user is busy with a search, loading, or in saved mode
            if (searchQuery.trim() !== '' || loading || fetchingMore || currentView !== 'feed' || mode === 'saved') return;

            const baseUrl = getApiBase();
            const enabledTopics = activeTopics.filter(t => !disabledTopics.includes(t));
            let url = `${baseUrl}/api/stories?limit=10&offset=0&sort=${mode}&topic_match=${topicMatch}`;
            enabledTopics.forEach(t => url += `&topic=${encodeURIComponent(t)}`);

            fetchWithAuth(url)
                .then(res => res.json())
                .then(data => {
                    if (data && data.stories && data.stories.length > 0) {
                        const currentTopId = storyBuffer[0]?.id;
                        const newStories: Story[] = [];
                        for (const s of data.stories) {
                            if (s.id === currentTopId) break;
                            if (!storyBuffer.some(os => os.id === s.id)) {
                                newStories.push(s);
                            }
                        }

                        if (newStories.length > 0) {
                            console.log(`Auto-refresh: Found ${newStories.length} new stories`);
                            // Prepend new stories and update total
                            setStoryBuffer(prev => [...newStories, ...prev]);
                            setTotalStories(prev => prev + newStories.length);
                        }
                    }
                })
                .catch(() => {});
        }, 60000);

        return () => clearInterval(autoRefreshInterval);
    }, [apiBase, storyBuffer, searchQuery, loading, fetchingMore, currentView, mode, topicMatch, activeTopics, disabledTopics]);

    useEffect(() => {
        // Initial fetch
        if (isElectron() && (!apiBase || apiBase.includes('hnstation.dev'))) {
            return;
        }

        // Diagnostic check: If we are in Electron but electronAPI is missing, show a warning
        if (isElectron() && !(window as any).electronAPI) {
            setGlobalWarning("IPC Bridge Failure: The background process is restricted. Please check if your antivirus is blocking the app components.");
        }

        const fetchMe = () => {
            if (isElectron() && !apiBase) return;
            const url = `${apiBase}/api/me`;

            fetchWithAuth(url, { credentials: 'include' })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setUser(data);
                        if (data.jwt_token) {
                            localStorage.setItem('hn_jwt_token', data.jwt_token);
                        }
                        // Initialize topics from backend if available
                        if (data.topics && Array.isArray(data.topics) && data.topics.length > 0) {
                            setActiveTopics(data.topics);
                        }
                    } else {
                        setUser(null);
                    }
                })
                .catch(() => {
                    setUser(null);
                });
        };

        fetchMe();

        // No polling needed in local mode anymore since we are always authenticated
        return () => { };
    }, [apiBase]);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => { 
        saveTopicChips(activeTopics); 
        
        // Sync to backend if authenticated
        if (user && user.authenticated && apiBase) {
            const url = `${apiBase}/api/user/topics`;
            fetchWithAuth(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topics: activeTopics }),
            }).catch(err => console.error('Failed to sync topics to backend:', err));
        }
    }, [activeTopics, user?.authenticated, apiBase]);
    useEffect(() => {
        try {
            localStorage.setItem('hn_disabled_topics', JSON.stringify(disabledTopics));
        } catch { }
    }, [disabledTopics]);

    // Reset offset when search queries or topics change
    useEffect(() => {
        setOffset(0);
    }, [activeTopics, disabledTopics, searchQuery, topicMatch]);

    useEffect(() => {
        try {
            if (tabs.length === 0) {
                localStorage.removeItem('hn_desktop_tabs');
            } else {
                localStorage.setItem('hn_desktop_tabs', JSON.stringify(tabs));
            }
        } catch { }
    }, [tabs]);

    useEffect(() => {
        if (activeTabId) {
            localStorage.setItem('hn_desktop_active_tab_id', activeTabId);
        } else {
            localStorage.removeItem('hn_desktop_active_tab_id');
        }
    }, [activeTabId]);

    useEffect(() => {
        localStorage.setItem('hn_desktop_current_view', currentView);
    }, [currentView]);

    useEffect(() => {
        localStorage.setItem('hn_filter_active', isFilterActive.toString());
    }, [isFilterActive]);

    useEffect(() => {
        localStorage.setItem('hn_desktop_primary_tab', primaryTab);
        if (primaryTab === 'bookmarks') {
            setMode('saved');
        } else {
            setMode(lastFeedMode);
        }
    }, [primaryTab, lastFeedMode]);

    useEffect(() => {
        if (mode !== 'saved') {
            setLastFeedMode(mode);
            localStorage.setItem('hn_desktop_last_feed_mode', mode);
        }
    }, [mode]);

    const handleHideStory = useCallback((id: number) => {
        setStoryBuffer(prev => prev.filter(s => s.id !== id));
        if (user) {
            const baseUrl = getApiBase();
            fetchWithAuth(`${baseUrl}/api/stories/${id}/interact`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hidden: true }),
            }).catch(() => { });
        }
        if (selectedStoryId === id) {
            const visible = storyBuffer.filter(s => !hiddenStories.has(s.id) && s.id !== id);
            const nextStory = visible[0] ?? null;
            setTabs(prev => prev.filter(t => t.storyId !== id));
            if (nextStory) handleStorySelect(nextStory.id);
            else setActiveTabId(null);
        } else {
            setTabs(prev => prev.filter(t => t.storyId !== id));
        }
    }, [user, selectedStoryId, storyBuffer, hiddenStories]);


    const handleStorySelect = useCallback((id: number, overrideMode?: 'article' | 'discussion' | 'split') => {
        let story = storyBuffer.find(s => s.id === id);

        // If story is not in the current buffer (e.g. user moved to another page),
        // check if we already have the story data in one of our open tabs.
        if (!story) {
            const existingTab = tabs.find(t => t.storyId === id);
            if (existingTab) {
                story = existingTab.story;
            }
        }


        if (!story) return;

        // In Web Preview mode, always open story.url in a new browser tab
        // and highlight the story on the right-hand comments workspace
        if (isWebPreview()) {
            if (story.url) {
                window.open(story.url, '_blank');
            }
            setHighlightedStoryId(id);
            return;
        }

        const actualMode = overrideMode || (story.url ? 'split' : 'discussion');

        setTabs(prev => {
            // Check if tab already exists
            const existingTab = prev.find(t => t.storyId === id);
            if (existingTab) {
                // If we forced a mode change, update it, otherwise just switch
                const targetMode = isWebPreview() ? 'discussion' : (overrideMode || existingTab.mode);
                if (existingTab.mode !== targetMode) {
                    return prev.map(t => t.id === existingTab.id ? { ...t, mode: targetMode } : t);
                }
                setTimeout(() => setActiveTabId(existingTab.id), 0);
                setTimeout(() => setCurrentView('reader'), 0);
                return prev;
            }

            // Create new tab
            const newTabId = crypto.randomUUID();
            const newTab: ReaderTab = { id: newTabId, storyId: id, story, mode: actualMode, parentTabId: activeTabId || undefined };

            setTimeout(() => setActiveTabId(newTabId), 0);
            setTimeout(() => setCurrentView('reader'), 0);

            // On mobile devices, we prefer replacing the single tab to save memory/UI space
            if (typeof window !== 'undefined' && window.innerWidth < 768) {
                return [newTab];
            }

            // On desktop, append
            return [...prev, newTab];
        });

        setReadIds(prev => {
            const next = new Set(prev);
            next.add(id);
            saveReadIds(next);
            return next;
        });
        localStorage.setItem('hn_last_story_id', id.toString());

        if (user) {
            const baseUrl = getApiBase();
            fetchWithAuth(`${baseUrl}/api/stories/${id}/interact`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true }),
            }).catch(() => { });
            setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_read: true } : s));
        }
    }, [user, storyBuffer]);

    const handleToggleSave = useCallback((id: number, saved: boolean) => {
        if (!user) return;
        setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_saved: saved } : s));
        setTabs(prev => prev.map(t => t.storyId === id ? { ...t, story: { ...t.story, is_saved: saved } } : t));

        const baseUrl = getApiBase();
        fetchWithAuth(`${baseUrl}/api/stories/${id}/interact`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saved }),
        }).catch(() => {
            setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_saved: !saved } : s));
            setTabs(prev => prev.map(t => t.storyId === id ? { ...t, story: { ...t.story, is_saved: !saved } } : t));
        });
    }, [user]);


    useEffect(() => {
        if (selectedStoryId) setHighlightedStoryId(selectedStoryId);
    }, [selectedStoryId]);

    useEffect(() => {
        if (!highlightedStoryId && stories.length > 0) setHighlightedStoryId(stories[0].id);
    }, [stories, highlightedStoryId]);

    const buildUrl = useCallback((currentOffset: number, limit: number = PAGE_SIZE) => {
        const baseUrl = apiBase ?? '';
        if (mode === 'saved') return `${baseUrl}/api/stories/saved?limit=${limit}&offset=${currentOffset}&_t=${Date.now()}`;
        let url = `${baseUrl}/api/stories?limit=${limit}&offset=${currentOffset}&sort=${mode}`;
        if (showHidden) url += `&show_hidden=true`;

        const enabledTopics = activeTopics.filter(t => !disabledTopics.includes(t));
        if (enabledTopics.length > 0) {
            enabledTopics.forEach(t => {
                url += `&topic=${encodeURIComponent(t)}`;
            });
            url += `&topic_match=${topicMatch}`;
        }
        
        if (searchQuery.trim() !== '') {
            url += `&search=${encodeURIComponent(searchQuery.trim())}`;
        }

        return url;
    }, [mode, showHidden, apiBase, activeTopics, disabledTopics, topicMatch, searchQuery]);

    // Consolidated fetcher
    const fetchPage = useCallback(async (currentOffset: number, isInitial: boolean = false) => {
        const url = buildUrl(currentOffset);
        if (!url) return;

        if (isInitial) {
            setLoading(true);
            setStoryBuffer([]);
            setOffset(0);
        } else {
            setFetchingMore(true);
        }
        setError(null);

        try {
            const res = await fetchWithAuth(url);
            if (!res.ok) throw new Error('Failed to fetch stories');
            const data = await res.json();
            const incoming: Story[] = data.stories || [];
            
            setStoryBuffer(prev => {
                if (isInitial) return incoming;
                const existingIds = new Set(prev.map(s => s.id));
                const fresh = incoming.filter(s => !existingIds.has(s.id));
                return [...prev, ...fresh];
            });

            setTotalStories(data.total || 0);
            setHasMore(incoming.length >= PAGE_SIZE);

            if (isInitial && incoming.length > 0 && !selectedStoryId) {
                const lastId = localStorage.getItem('hn_last_story_id');
                if (lastId) {
                    const id = parseInt(lastId);
                    const exists = incoming.find((s: Story) => s.id === id);
                    if (exists) handleStorySelect(id);
                    else handleStorySelect(incoming[0].id);
                } else {
                    handleStorySelect(incoming[0].id);
                }
                setCurrentView('feed');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
            setFetchingMore(false);
        }
    }, [buildUrl, selectedStoryId, handleStorySelect]);

    const fetchNextPage = useCallback(() => {
        if (!hasMore || fetchingMore || loading) return;
        const nextOffset = storyBuffer.length;
        fetchPage(nextOffset);
    }, [hasMore, fetchingMore, loading, storyBuffer.length, fetchPage]);

    // Initial load and filter resets
    useEffect(() => {
        if (isElectron() && !apiBase) return;
        fetchPage(0, true);
    }, [mode, refreshKey, showHidden, activeTopics, disabledTopics, topicMatch, searchQuery, apiBase, isFilterActive]);

    useEffect(() => {
        if (!apiBase || storyBuffer.length === 0) return;
        
        // Prioritize the top stories in the current view (first 20)
        const visibleIds = storyBuffer.slice(0, 20).map(s => s.id);
        const idsKey = visibleIds.join(',');
        
        if (idsKey === lastPrioritizedIdsRef.current) return;
        lastPrioritizedIdsRef.current = idsKey;

        fetchWithAuth(`${apiBase}/api/summary/prioritize`, {
            method: 'POST',
            body: JSON.stringify({ ids: visibleIds })
        }).catch(err => console.error('[useAppState] priority sync error:', err));
    }, [storyBuffer, apiBase]);

    useEffect(() => {
        const fetchStats = () => {
            const baseUrl = getApiBase();
            if (!baseUrl && isElectron()) return;
            
            fetchWithAuth(`${baseUrl}/api/stats`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) setBackendStats(data);
                })
                .catch(err => console.error('[useAppState] stats fetch error:', err));
        };

        // Initial fetch
        fetchStats();

        // Only poll if Admin Dashboard is open OR we have no stories (showing "Initializing" screen)
        let interval: any;
        if (isAdminModalOpen || (stories.length === 0 && !loading)) {
            interval = setInterval(fetchStats, 15000); // Pulse slower (15s)
        }
        
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [apiBase, isAdminModalOpen, stories.length === 0, loading]);

    // Removed refill logic as we now use infinite scroll with fetchNextPage

    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        stories.forEach(story => { if (story.topics) story.topics.forEach((t: string) => tags.add(t)); });
        return Array.from(tags).sort();
    }, [stories]);

    useEffect(() => {
        if (selectedStoryId === null) return;
        const baseUrl = apiBase ?? '';
        fetchWithAuth(`${baseUrl}/api/stories/${selectedStoryId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                // We still want to update the tab's injected story object (with URL etc.)
                // so that the webview can load the actual URL if the feed only had partial data.
                if (data && data.story) {
                    if (activeTabId) {
                        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, story: data.story } : t));
                    }
                    // Sync the main story buffer so sidebar summary updates
                    setStoryBuffer(prev => prev.map(s => s.id === data.story.id ? data.story : s));
                }
            })
            .catch(() => { });
    }, [selectedStoryId]);

    // Clear global warning when story changes
    useEffect(() => {
        setGlobalWarning(null);
    }, [selectedStoryId]);

    const state = {
        // State
        storyBuffer, loading, error, mode, activeTopics, disabledTopics, totalStories,
        hasMore, fetchingMore, readIds, theme, highlightedStoryId,
        tabs, activeTabId, showHidden,
        isSettingsOpen, currentView, isAdminModalOpen, user,
        hiddenStories, offset, globalWarning, backendStats, primaryTab, isFilterActive,
        searchQuery, topicMatch,
        // Derived
        activeTab, selectedStoryId, selectedStory, readerTab, stories, availableTags, apiBase,
        isWebMode,
        // Setters
        setMode, setOffset, setActiveTopics, setTheme, setShowHidden, setIsSettingsOpen,
        setCurrentView, setIsAdminModalOpen, setHighlightedStoryId, setReadIds,
        setDisabledTopics, setGlobalWarning, setPrimaryTab, setIsFilterActive,
        setSearchQuery, setTopicMatch, fetchNextPage, setLastFeedMode,
        // Handlers
        handleRefresh, handleRefreshTab, toggleTheme, closeTab, setReaderTab, updateTabMode, setStoryIframeBlocked, setStoryDiscussionSummary, handleHideStory,
        toggleAISidebar,
        handleStorySelect, handleToggleSave, handleBack, handleHome,
        handleSummarizeStory: async (id: number) => {
            const baseUrl = getApiBase();
            const isWeb = isWebPreview();
            const aiSettings = getClientAISettings();

            if (isWeb && aiSettings.provider !== 'disabled') {
                try {
                    // 1. Fetch story content from /api/stories/{id}/content
                    const contentRes = await fetchWithAuth(`${baseUrl}/api/stories/${id}/content`);
                    if (!contentRes.ok) {
                        throw new Error(`Failed to fetch article content for summarization (status ${contentRes.status})`);
                    }
                    const contentData = await contentRes.json();
                    const articleText = contentData.content || "";
                    const articleTitle = contentData.title || "";

                    // 2. Generate summary via client AI
                    const clientResult = await clientGenerateSummary(articleTitle, articleText);
                    const generatedSummary = clientResult.summary;
                    const generatedTopics = clientResult.topics;

                    // 3. Patch generated summary to database so other users can see it
                    await fetchWithAuth(`${baseUrl}/api/stories/${id}/summary`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            summary: generatedSummary,
                            topics: generatedTopics
                        })
                    });

                    // 4. Update local state
                    setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, summary: generatedSummary, topics: generatedTopics.length > 0 ? generatedTopics : s.topics } : s));
                    setTabs(prev => prev.map(t => t.storyId === id ? { ...t, story: { ...t.story, summary: generatedSummary, topics: generatedTopics.length > 0 ? generatedTopics : t.story.topics } } : t));
                    
                    return { summary: generatedSummary, topics: generatedTopics };
                } catch (clientErr: any) {
                    console.error('[useAppState] Client Summarization Error:', clientErr);
                    setGlobalWarning(clientErr.message || "Failed to generate client-side summary.");
                    return null;
                }
            }

            const response = await fetchWithAuth(`${baseUrl}/api/stories/${id}/summarize?force=true`, {
                method: 'POST'
            });

            if (response.status === 429) {
                const data = await response.json();
                const msg = data.error || "AI rate limit reached. Please try again in a moment.";
                console.error('AI Rate Limit:', msg);
                setGlobalWarning(msg);
                return;
            }

            if (!response.ok) {
                const text = await response.text();
                const status = response.status;
                const msg = `AI Error (${status}): ${text || 'Empty response from server'}`;
                console.error('AI Fetch failure:', msg);
                setGlobalWarning(msg);
                return;
            }

            const data = await response.json();
            if (data.summary) {
                setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, summary: data.summary, topics: data.topics || s.topics } : s));
                setTabs(prev => prev.map(t => t.storyId === id ? { ...t, story: { ...t.story, summary: data.summary, topics: data.topics || t.story.topics } } : t));
                return data;
            }
            return null;
        },
    };

    if (typeof window !== 'undefined') {
        (window as any).appState = state;
    }

    return state;
}
