import { useEffect, useState, useCallback, useMemo } from 'react';
import { PAGE_SIZE, MAX_READ_IDS } from '../types';
import type { Story, ReaderTab, ModeKey } from '../types';
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

interface User {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    is_admin: boolean;
}

export function getStoryTopicMatch(storyTitle: string, storyTopics: string[] | undefined, activeTopics: string[]): string | null {
    const titleLower = storyTitle.toLowerCase();
    for (const active of activeTopics) {
        const activeLower = active.toLowerCase();
        if (titleLower.includes(activeLower)) return active;
        if (storyTopics) {
            for (const t of storyTopics) {
                if (t.toLowerCase() === activeLower) return active;
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
    const [tabs, setTabs] = useState<ReaderTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);

    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);

    const [showHidden, setShowHidden] = useState(false);
    const hiddenStories = new Set<number>();

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'feed' | 'reader' | 'admin'>('feed');
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
        const baseUrl = import.meta.env.VITE_API_URL || '';
        fetch(`${baseUrl}/api/me`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data && data.id) setUser(data); })
            .catch(() => { });
    }, []);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => { saveTopicChips(activeTopics); }, [activeTopics]);

    const handleHideStory = useCallback((id: number) => {
        setStoryBuffer(prev => prev.filter(s => s.id !== id));
        setBufferOffset(prev => prev);
        if (user) {
            const baseUrl = import.meta.env.VITE_API_URL || '';
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
        const story = storyBuffer.find(s => s.id === id);
        if (!story) return;

        const actualMode = overrideMode || (story.url ? 'article' : 'discussion');

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
            const baseUrl = import.meta.env.VITE_API_URL || '';
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

        const baseUrl = import.meta.env.VITE_API_URL || '';
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
        handleStorySelect(storyId);
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

    const buildUrl = useCallback((currentOffset: number, limit: number = PAGE_SIZE * 2) => {
        const baseUrl = import.meta.env.VITE_API_URL || '';
        if (mode === 'saved') return `${baseUrl}/api/stories/saved?limit=${limit}&offset=${currentOffset}&_t=${Date.now()}`;
        let url = `${baseUrl}/api/stories?limit=${limit}&offset=${currentOffset}&sort=${mode}`;
        if (showHidden) url += `&show_hidden=true`;
        return url;
    }, [mode, showHidden]);

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
        setFetchingMore(true);
        fetch(buildUrl(bufferOffset))
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
        fetch(buildUrl(0))
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
    }, [mode, refreshKey, showHidden]);

    useEffect(() => {
        const REFILL_THRESHOLD = PAGE_SIZE + 2;
        const visibleCount = storyBuffer.filter(s => !hiddenStories.has(s.id)).length;
        if (!fetchingMore && hasMore && visibleCount < REFILL_THRESHOLD && storyBuffer.length > 0) {
            setBufferOffset(storyBuffer.length);
        }
    }, [storyBuffer, hiddenStories, hasMore, fetchingMore]);

    const availableTags = useMemo(() => {
        const tags = new Set<string>();
        stories.forEach(story => { if (story.topics) story.topics.forEach((t: string) => tags.add(t)); });
        return Array.from(tags).sort();
    }, [stories]);

    useEffect(() => {
        if (!selectedStoryId) { setComments([]); return; }
        setCommentsLoading(true);
        setComments([]);
        const baseUrl = import.meta.env.VITE_API_URL || '';
        fetch(`${baseUrl}/api/stories/${selectedStoryId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setComments(data.comments || []);
                    if (data.story && activeTabId) {
                        setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, story: data.story } : t));
                    }
                }
                setCommentsLoading(false);
            })
            .catch(() => setCommentsLoading(false));
    }, [selectedStoryId]);

    return {
        // State
        storyBuffer, loading, error, mode, activeTopics, totalStories,
        hasMore, fetchingMore, readIds, theme, highlightedStoryId,
        tabs, activeTabId, comments, commentsLoading, showHidden,
        isSettingsOpen, currentView, readingQueue, isAdminModalOpen, user,
        hiddenStories, offset,
        // Derived
        activeTab, selectedStoryId, selectedStory, readerTab, stories, availableTags,
        // Setters
        setMode, setOffset, setActiveTopics, setTheme, setShowHidden, setIsSettingsOpen,
        setCurrentView, setReadingQueue, setIsAdminModalOpen, setHighlightedStoryId,
        // Handlers
        handleRefresh, toggleTheme, closeTab, setReaderTab, handleHideStory,
        handleToggleQueue, handleStorySelect, handleToggleSave,
        handleStoryInteractWithQueue, handleQueueAllFiltered
    };
}
