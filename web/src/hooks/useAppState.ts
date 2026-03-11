import { useEffect, useState, useCallback, useMemo } from 'react';
import { PAGE_SIZE, MAX_READ_IDS } from '../types';
import type { Story, ReaderTab, ModeKey } from '../types';
import { getApiBase, subscribeApiBase } from '../utils/apiBase';
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
    return [];
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

interface User {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    is_admin: boolean;
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
    const [bufferOffset, setBufferOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiBase, setApiBase] = useState(getApiBase());

    const [mode, setMode] = useState<ModeKey>('default');
    const [offset, setOffset] = useState(0);
    const [activeTopics, setActiveTopics] = useState<string[]>(loadTopicChips);
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
    const [readingQueue, setReadingQueue] = useState<number[]>([]);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
    const [user, setUser] = useState<User | null>(null);

    const handleRefresh = () => setRefreshKey(prev => prev + 1);
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
    const selectedStoryId = activeTab?.storyId || null;
    const selectedStory = activeTab?.story || null;
    const readerTab = activeTab?.mode || 'article';

    const setReaderTab = useCallback((m: 'article' | 'discussion' | 'split') => {
        if (!activeTabId) return;
        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, mode: m } : t));
    }, [activeTabId]);

    const stories = storyBuffer; // Backend already paginates this buffer

    useEffect(() => {
        console.log('[state] Subscribing to API base...');
        return subscribeApiBase(url => {
            console.log('[state] API base resolved to:', url);
            setApiBase(url);
        });
    }, []);

    useEffect(() => {
        // Wait for apiBase to be resolved in Electron to avoid 401 on fallback
        const isElectron = !!(window as any).electronAPI;
        if (isElectron && (!apiBase || apiBase.includes('hnstation.dev'))) {
            console.log('[state] Electron detected, waiting for non-fallback apiBase to fetch user data.');
            return;
        }
        if (!apiBase) {
            console.log('[state] apiBase not resolved yet, skipping user data fetch.');
            return;
        }
        console.log('[state] Fetching user data from:', apiBase);

        fetch(`${apiBase}/api/me`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => setUser(data))
            .catch(() => setUser(null));
    }, [apiBase]);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => { saveTopicChips(activeTopics); }, [activeTopics]);

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

    const handleHideStory = useCallback((id: number) => {
        setStoryBuffer(prev => prev.filter(s => s.id !== id));
        setBufferOffset(prev => prev);
        if (user) {
            const baseUrl = getApiBase();
            fetch(`${baseUrl}/api/stories/${id}/interact`, {
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

    const handleToggleQueue = useCallback((id: number) => {
        setReadingQueue(prev => prev.includes(id) ? prev.filter(q => q !== id) : [...prev, id]);
    }, []);

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

        const actualMode = overrideMode || (story.url ? 'split' : 'discussion');

        setTabs(prev => {
            // Check if tab already exists
            const existingTab = prev.find(t => t.storyId === id);
            if (existingTab) {
                // If we forced a mode change, update it, otherwise just switch
                if (overrideMode && existingTab.mode !== overrideMode) {
                    return prev.map(t => t.id === existingTab.id ? { ...t, mode: overrideMode } : t);
                }
                setTimeout(() => setActiveTabId(existingTab.id), 0);
                setTimeout(() => setCurrentView('reader'), 0);
                return prev;
            }

            // Create new tab
            const newTabId = crypto.randomUUID();
            const newTab = { id: newTabId, storyId: id, story, mode: actualMode };

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
            fetch(`${baseUrl}/api/stories/${id}/interact`, {
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
        fetch(`${baseUrl}/api/stories/${id}/interact`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saved }),
        }).catch(() => {
            setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_saved: !saved } : s));
            setTabs(prev => prev.map(t => t.storyId === id ? { ...t, story: { ...t.story, is_saved: !saved } } : t));
        });
    }, [user]);

    const handleStoryInteractWithQueue = useCallback((storyId: number, matchedTopic: string | null) => {
        let newQueue = [...readingQueue];
        const isQueued = readingQueue.includes(storyId);

        if (matchedTopic) {
            const matchingIds = stories
                .filter(s => getStoryTopicMatch(s.title, s.topics, [matchedTopic]) !== null)
                .filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden))
                .map(s => s.id);
            matchingIds.forEach(id => { if (!newQueue.includes(id)) newQueue.push(id); });
            if (!newQueue.includes(storyId)) newQueue.push(storyId);
        } else if (!isQueued) {
            newQueue.push(storyId);
        }
        setReadingQueue(newQueue);
        handleStorySelect(storyId, 'split');
    }, [readingQueue, stories, showHidden, hiddenStories, handleStorySelect]);

    const handleQueueAllFiltered = useCallback(() => {
        if (activeTopics.length === 0) return;
        const matchedIds = stories
            .filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden))
            .filter(s => {
                const matched = getStoryTopicMatch(s.title, s.topics, activeTopics);
                return matched !== null && !readingQueue.includes(s.id);
            })
            .map(s => s.id);
        if (matchedIds.length > 0) setReadingQueue(prev => [...prev, ...matchedIds]);
    }, [activeTopics, stories, showHidden, hiddenStories, readingQueue]);

    useEffect(() => {
        if (selectedStoryId) setHighlightedStoryId(selectedStoryId);
    }, [selectedStoryId]);

    useEffect(() => {
        if (!highlightedStoryId && stories.length > 0) setHighlightedStoryId(stories[0].id);
    }, [stories, highlightedStoryId]);

    const buildUrl = useCallback((currentOffset: number, limit: number = PAGE_SIZE) => {
        if (!apiBase) return '';
        if (mode === 'saved') return `${apiBase}/api/stories/saved?limit=${limit}&offset=${currentOffset}&_t=${Date.now()}`;
        let url = `${apiBase}/api/stories?limit=${limit}&offset=${currentOffset}&sort=${mode}`;
        if (showHidden) url += `&show_hidden=true`;
        if (activeTopics.length > 0) {
            activeTopics.forEach(t => {
                url += `&topic=${encodeURIComponent(t)}`;
            });
        }
        return url;
    }, [mode, showHidden, apiBase, activeTopics]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setHasMore(true);
        setStoryBuffer([]);
        setBufferOffset(0);
    }, [mode, refreshKey, showHidden]);

    useEffect(() => {
        if (bufferOffset === 0) return;
        if (!hasMore || fetchingMore) return;
        const url = buildUrl(bufferOffset);
        if (!url) return;
        setFetchingMore(true);
        fetch(url)
            .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
            .then(data => {
                const incoming: Story[] = data.stories || [];
                setStoryBuffer(prev => {
                    const existingIds = new Set(prev.map(s => s.id));
                    const fresh = incoming.filter(s => !existingIds.has(s.id));
                    return [...prev, ...fresh];
                });
                setHasMore(incoming.length >= PAGE_SIZE);
                setFetchingMore(false);
            })
            .catch(() => setFetchingMore(false));
    }, [bufferOffset]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const url = buildUrl(offset);
        if (!url) return;
        fetch(url)
            .then(res => { if (!res.ok) throw new Error('Failed to fetch stories'); return res.json(); })
            .then(data => {
                const incoming: Story[] = data.stories || [];
                setStoryBuffer(incoming);
                setTotalStories(data.total || 0);
                setLoading(false);
                setHasMore(incoming.length >= PAGE_SIZE);
                if (incoming.length > 0 && !selectedStoryId) {
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
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [mode, refreshKey, showHidden, offset, apiBase]);

    useEffect(() => {
        // Only trigger the "refill" logic if we are on the first page (offset 0).
        // If the user uses explicit pagination (offset > 0), we disable refill to avoid conflicts.
        if (offset > 0) return;

        const REFILL_THRESHOLD = PAGE_SIZE - 2;
        const visibleCount = storyBuffer.filter(s => !hiddenStories.has(s.id)).length;
        if (!fetchingMore && hasMore && visibleCount < REFILL_THRESHOLD && storyBuffer.length > 0) {
            setBufferOffset(storyBuffer.length);
        }
    }, [storyBuffer, hiddenStories, hasMore, fetchingMore, offset]);

    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        stories.forEach(story => { if (story.topics) story.topics.forEach((t: string) => tags.add(t)); });
        return Array.from(tags).sort();
    }, [stories]);

    useEffect(() => {
        if (!selectedStoryId) return;
        const baseUrl = apiBase || '';
        fetch(`${baseUrl}/api/stories/${selectedStoryId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                // We still want to update the tab's injected story object (with URL etc.)
                // so that the webview can load the actual URL if the feed only had partial data.
                if (data && data.story && activeTabId) {
                    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, story: data.story } : t));
                }
            })
            .catch(() => { });
    }, [selectedStoryId]);

    return {
        // State
        storyBuffer, loading, error, mode, activeTopics, totalStories,
        hasMore, fetchingMore, readIds, theme, highlightedStoryId,
        tabs, activeTabId, showHidden,
        isSettingsOpen, currentView, readingQueue, isAdminModalOpen, user,
        hiddenStories, offset,
        // Derived
        activeTab, selectedStoryId, selectedStory, readerTab, stories, availableTags, apiBase,
        // Setters
        setMode, setOffset, setActiveTopics, setTheme, setShowHidden, setIsSettingsOpen,
        setCurrentView, setReadingQueue, setIsAdminModalOpen, setHighlightedStoryId, setReadIds,
        // Handlers
        handleRefresh, toggleTheme, closeTab, setReaderTab, handleHideStory,
        handleToggleQueue, handleStorySelect, handleToggleSave,
        handleStoryInteractWithQueue, handleQueueAllFiltered
    };
}
