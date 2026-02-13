import { useEffect, useState, useRef, useCallback } from 'react';
import './App.css';
import { StoryCard } from './components/StoryCard';
import { ReaderPane } from './components/ReaderPane';
import { RefreshCw, Search, X, Moon, Sun, Star, LogIn, LogOut, TrendingUp, Clock, Trophy, Monitor, Bookmark } from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, useDefaultLayout } from 'react-resizable-panels';

interface Story {
  id: number;
  title: string;
  url: string;
  score: number;
  by: string;
  descendants: number;
  time: string;
  created_at: string;
  hn_rank?: number;
  is_read?: boolean;
  is_saved?: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  is_admin: boolean;
}

const MODES = [
  { key: 'default', label: 'Top', icon: TrendingUp },
  { key: 'latest', label: 'New', icon: Clock },
  { key: 'votes', label: 'Best', icon: Trophy },
  { key: 'show', label: 'Show HN', icon: Monitor },
  { key: 'saved', label: 'Bookmarks', icon: Bookmark },
] as const;

const QUICK_FILTERS = ['Postgres', 'Rust', 'AI', 'LLM', 'Go'];

type ModeKey = typeof MODES[number]['key'];

const PAGE_SIZE = 50;
const MAX_READ_IDS = 500;

// Color palette for topic chips — visually distinct, muted for dark mode
const TOPIC_COLORS = [
  { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-500/30', accent: '#10b981' },
  { bg: 'bg-violet-100 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-300 dark:border-violet-500/30', accent: '#8b5cf6' },
  { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-500/30', accent: '#f59e0b' },
  { bg: 'bg-sky-100 dark:bg-sky-500/15', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-300 dark:border-sky-500/30', accent: '#0ea5e9' },
  { bg: 'bg-rose-100 dark:bg-rose-500/15', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-300 dark:border-rose-500/30', accent: '#f43f5e' },
  { bg: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-300 dark:border-teal-500/30', accent: '#14b8a6' },
  { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-500/30', accent: '#f97316' },
  { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-500/30', accent: '#6366f1' },
];

function getTopicColor(topic: string) {
  // Deterministic hash → color index
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = topic.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TOPIC_COLORS[Math.abs(hash) % TOPIC_COLORS.length];
}

// Check which active topic (if any) matches a story title
function getStoryTopicMatch(title: string, topics: string[]): string | null {
  const lowerTitle = title.toLowerCase();
  for (const topic of topics) {
    if (lowerTitle.includes(topic.toLowerCase())) return topic;
  }
  return null;
}

// localStorage helpers
function loadReadIds(): Set<number> {
  try {
    const saved = localStorage.getItem('hn_read_stories');
    if (saved) return new Set(JSON.parse(saved));
  } catch { }
  return new Set();
}

function saveReadIds(ids: Set<number>) {
  // Cap at MAX_READ_IDS (keep most recent)
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
  localStorage.setItem('hn_topic_chips', JSON.stringify(chips));
}

function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ModeKey>('default');
  const [activeTopics, setActiveTopics] = useState<string[]>(loadTopicChips);
  const [topicInput, setTopicInput] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Infinite scroll
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Read tracking
  const [readIds, setReadIds] = useState<Set<number>>(loadReadIds);

  // Theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as 'dark' | 'light';
    }
    return 'dark';
  });

  // Comments
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Keyboard Nav
  const [focusMode, setFocusMode] = useState<'stories' | 'reader' | 'header'>('stories');
  const readerContainerRef = useRef<HTMLElement>(null);
  const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const topicInputRef = useRef<HTMLInputElement>(null);
  const modeButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);



  // User auth state (optional — site works without login)
  const [user, setUser] = useState<User | null>(null);

  // Fetch current user on load
  useEffect(() => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/me`, { credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        return null;
      })
      .then(data => {
        if (data && data.id) setUser(data);
      })
      .catch(() => { }); // Silently ignore — anonymous usage is fine
  }, []);

  // Theme effect
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Persist topic chips
  useEffect(() => {
    saveTopicChips(activeTopics);
  }, [activeTopics]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key === ' ') {
        e.preventDefault();
        if (focusMode === 'stories' && selectedStoryId) {
          setFocusMode('reader');
          setTimeout(() => readerContainerRef.current?.focus(), 50);
        } else if (focusMode === 'reader') {
          setFocusMode('stories');
          const idx = stories.findIndex(s => s.id === selectedStoryId);
          if (idx !== -1) setTimeout(() => storyRefs.current[idx]?.focus(), 50);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusMode('stories');
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        if (idx !== -1) setTimeout(() => storyRefs.current[idx]?.focus(), 50);
        return;
      }

      if (e.key === 'ArrowRight' && focusMode === 'stories' && selectedStoryId) {
        setFocusMode('reader');
        e.preventDefault();
        setTimeout(() => readerContainerRef.current?.focus(), 50);
      } else if (e.key === 'ArrowLeft' && focusMode === 'reader') {
        setFocusMode('stories');
        e.preventDefault();
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        if (idx !== -1) setTimeout(() => storyRefs.current[idx]?.focus(), 50);
      } else if (e.key === 'ArrowUp' && focusMode === 'stories' && stories.length > 0) {
        e.preventDefault();
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        if (idx <= 0) {
          // At first story — move focus to header mode pills
          setFocusMode('header');
          const modeIdx = MODES.findIndex(m => m.key === mode);
          setTimeout(() => modeButtonRefs.current[modeIdx]?.focus(), 50);
        } else {
          const prev = idx - 1;
          setSelectedStoryId(stories[prev].id);
          storyRefs.current[prev]?.focus();
        }
      } else if (e.key === 'ArrowDown' && focusMode === 'header') {
        // From header pills, go back to first story
        e.preventDefault();
        setFocusMode('stories');
        if (stories.length > 0) {
          setSelectedStoryId(stories[0].id);
          setTimeout(() => storyRefs.current[0]?.focus(), 50);
        }
      } else if (e.key === 'ArrowLeft' && focusMode === 'header') {
        e.preventDefault();
        const modeIdx = MODES.findIndex(m => m.key === mode);
        const prev = Math.max(0, modeIdx - 1);
        setMode(MODES[prev].key);
        setTimeout(() => modeButtonRefs.current[prev]?.focus(), 50);
      } else if (e.key === 'ArrowRight' && focusMode === 'header') {
        e.preventDefault();
        const modeIdx = MODES.findIndex(m => m.key === mode);
        const next = Math.min(MODES.length - 1, modeIdx + 1);
        setMode(MODES[next].key);
        setTimeout(() => modeButtonRefs.current[next]?.focus(), 50);
      } else if (e.key === 'ArrowDown' && focusMode === 'stories' && stories.length > 0) {
        e.preventDefault();
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        const next = Math.min(stories.length - 1, idx + 1);
        setSelectedStoryId(stories[next].id);
        storyRefs.current[next]?.focus();
      } else if (e.key === 'PageDown' && focusMode === 'stories' && stories.length > 0) {
        e.preventDefault();
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        const next = Math.min(stories.length - 1, idx + 5);
        setSelectedStoryId(stories[next].id);
        storyRefs.current[next]?.focus();
      } else if (e.key === 'PageUp' && focusMode === 'stories' && stories.length > 0) {
        e.preventDefault();
        const idx = stories.findIndex(s => s.id === selectedStoryId);
        const prev = Math.max(0, idx - 5);
        setSelectedStoryId(stories[prev].id);
        storyRefs.current[prev]?.focus();
      } else if (e.key === '/') {
        e.preventDefault();
        topicInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stories, selectedStoryId, focusMode]);

  // Build API URL
  const buildUrl = useCallback((currentOffset: number) => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    if (mode === 'saved') {
      return `${baseUrl}/api/stories/saved?limit=${PAGE_SIZE}&offset=${currentOffset}&_t=${Date.now()}`;
    }
    let url = `${baseUrl}/api/stories?limit=${PAGE_SIZE}&offset=${currentOffset}&sort=${mode}`;
    activeTopics.forEach(t => {
      url += `&topic=${encodeURIComponent(t)}`;
    });
    url += `&_t=${Date.now()}`;
    return url;
  }, [mode, activeTopics]);

  // Initial fetch (reset on mode/topics change)
  useEffect(() => {
    setLoading(true);
    setError(null);
    setOffset(0);
    setHasMore(true);

    fetch(buildUrl(0))
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch stories');
        return res.json();
      })
      .then(data => {
        setStories(data);
        setLoading(false);
        setHasMore(data.length >= PAGE_SIZE);
        if (data && data.length > 0 && !selectedStoryId) {
          setSelectedStoryId(data[0].id);
        }
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [mode, activeTopics, refreshKey, buildUrl]);

  // Load more (infinite scroll)
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextOffset = offset + PAGE_SIZE;

    fetch(buildUrl(nextOffset))
      .then(res => {
        if (!res.ok) throw new Error('Failed to load more');
        return res.json();
      })
      .then(data => {
        setStories(prev => [...prev, ...data]);
        setOffset(nextOffset);
        setHasMore(data.length >= PAGE_SIZE);
        setLoadingMore(false);
      })
      .catch(err => {
        console.error(err);
        setLoadingMore(false);
      });
  }, [offset, hasMore, loadingMore, buildUrl]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        loadMore();
      }
    }, { threshold: 0.1 });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Fetch comments
  useEffect(() => {
    if (!selectedStoryId) {
      setComments([]);
      setSelectedStory(null);
      return;
    }

    const storyInList = stories.find(s => s.id === selectedStoryId);
    if (storyInList) setSelectedStory(storyInList);

    setCommentsLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/stories/${selectedStoryId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch comments');
        return res.json();
      })
      .then(data => {
        setComments(data.comments || []);
        if (data.story) setSelectedStory(data.story);
        setCommentsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch comments", err);
        setCommentsLoading(false);
      });
  }, [selectedStoryId, stories]);

  const handleRefresh = () => setRefreshKey(prev => prev + 1);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleStorySelect = (id: number) => {
    setSelectedStoryId(id);
    setFocusMode('stories');
    // Mark as read (local)
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
    // Mark as read (server, if logged in)
    if (user) {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const t = true;
      fetch(`${baseUrl}/api/stories/${id}/interact`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: t }),
      }).catch(() => { });
      // Update local story state
      setStories(prev => prev.map(s => s.id === id ? { ...s, is_read: true } : s));
    }
  };

  // Toggle save/unsave a story
  const handleToggleSave = (id: number, saved: boolean) => {
    if (!user) return;
    // Optimistic update
    setStories(prev => prev.map(s => s.id === id ? { ...s, is_saved: saved } : s));
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/stories/${id}/interact`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved }),
    }).catch(() => {
      // Revert on failure
      setStories(prev => prev.map(s => s.id === id ? { ...s, is_saved: !saved } : s));
    });
  };

  // Topic chip handlers
  const addTopicChip = (topic: string) => {
    const trimmed = topic.trim().toLowerCase();
    if (trimmed && !activeTopics.includes(trimmed)) {
      setActiveTopics(prev => [...prev, trimmed]);
    }
    setTopicInput('');
  };

  const removeTopicChip = (topic: string) => {
    setActiveTopics(prev => prev.filter(t => t !== topic));
  };

  const handleTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTopicChip(topicInput);
  };

  const handleTopicKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && topicInput === '' && activeTopics.length > 0) {
      // Remove last chip
      setActiveTopics(prev => prev.slice(0, -1));
    }
  };

  // Resize Handle
  const ResizeHandle = () => (
    <PanelResizeHandle className="w-2 flex justify-center items-stretch group focus:outline-none">
      <div className="w-[1px] bg-gray-200 dark:bg-slate-800 transition-colors group-hover:bg-blue-500 group-active:bg-blue-600 dark:group-hover:bg-blue-500 delay-75 h-full"></div>
    </PanelResizeHandle>
  );

  // Layout persistence
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'hn-zen-v2',
    storage: localStorage,
  });

  return (
    <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">

      {/* ─── Zen Header ─── */}
      <header className="bg-[#1a2332] border-b border-slate-700 px-5 flex-shrink-0 z-50 h-16">
        <div className="flex items-center h-full gap-8">

          {/* Brand */}
          <span className="font-bold text-base tracking-tight text-orange-500 shrink-0">HN Station</span>

          {/* GitHub-Style Nav Tabs */}
          <nav className="h-full flex items-center gap-6">
            {MODES.map((m, i) => {
              const Icon = m.icon;
              const isActive = mode === m.key;
              return (
                <button
                  key={m.key}
                  ref={el => modeButtonRefs.current[i] = el}
                  onClick={() => { setMode(m.key); setFocusMode('stories'); }}
                  className={`h-full flex items-center gap-1.5 text-sm font-medium border-b-2 transition-all outline-none ${isActive
                    ? 'text-white border-orange-500 pb-3 mt-3'
                    : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-b-2 hover:border-gray-600'
                    }`}
                >
                  <Icon size={15} />
                  {m.label}
                </button>
              );
            })}
          </nav>

          {/* Search + Quick Filters */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <form onSubmit={handleTopicSubmit} className="relative max-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                ref={topicInputRef}
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={handleTopicKeyDown}
                placeholder="Filter... (/)"
                className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-md pl-9 pr-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all placeholder-slate-500"
              />
            </form>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5">
              {QUICK_FILTERS.map(filter => {
                const isFilterActive = activeTopics.includes(filter.toLowerCase());
                return (
                  <button
                    key={filter}
                    onClick={() => {
                      const lower = filter.toLowerCase();
                      if (isFilterActive) {
                        removeTopicChip(lower);
                      } else {
                        addTopicChip(lower);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${isFilterActive
                      ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>

            {/* Active custom topic chips */}
            {activeTopics.filter(t => !QUICK_FILTERS.map(f => f.toLowerCase()).includes(t)).map(topic => {
              const color = getTopicColor(topic);
              return (
                <span
                  key={topic}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border shrink-0 ${color.bg} ${color.text} ${color.border}`}
                >
                  {topic}
                  <button
                    onClick={() => removeTopicChip(topic)}
                    className="ml-0.5 hover:text-red-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
              title={theme === 'dark' ? "Light Mode" : "Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* User Auth */}
            {user ? (
              <div className="flex items-center gap-2 ml-1">
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-7 h-7 rounded-full ring-2 ring-slate-700"
                  title={user.name}
                />
                <a
                  href="/auth/logout"
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </a>
              </div>
            ) : (
              <a
                href="/auth/google"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all active:scale-95 shadow-sm shadow-blue-500/25 ml-1"
              >
                <LogIn size={14} />
                Sign in
              </a>
            )}
          </div>

        </div>
      </header>

      {/* ─── 2-Pane Layout ─── */}
      <PanelGroup
        orientation="horizontal"
        id="hn-zen-v2"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >

        {/* Story Feed */}
        <Panel defaultSize={35} minSize={25} id="feed">
          <div className="h-full flex flex-col bg-slate-950">
            <main
              className={`flex-1 overflow-y-auto custom-scrollbar p-3 transition-all ${focusMode === 'stories' ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.3)]' : ''}`}
            >
              {loading && (
                <div className="p-20 text-center text-gray-400 dark:text-slate-500 flex flex-col items-center gap-4">
                  <div className="animate-spin text-blue-500"><RefreshCw size={32} /></div>
                  <p className="font-medium animate-pulse">Loading stories...</p>
                </div>
              )}

              {error && (
                <div className="p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-xl flex items-center gap-3 shadow-sm">
                  <X size={20} />
                  <p>{error}</p>
                </div>
              )}

              {!loading && !error && (
                <div className="space-y-3">
                  {stories.map((story, index) => {
                    const isSelected = selectedStoryId === story.id;
                    const isRead = readIds.has(story.id) || story.is_read;
                    const matchedTopic = activeTopics.length > 0 ? getStoryTopicMatch(story.title, activeTopics) : null;
                    const topicAccent = matchedTopic ? getTopicColor(matchedTopic).accent : null;
                    return (
                      <div
                        key={story.id}
                        ref={el => storyRefs.current[index] = el}
                        tabIndex={0}
                        role="button"
                        aria-selected={isSelected}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleStorySelect(story.id);
                            const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        onClick={() => handleStorySelect(story.id)}
                        className={`transition-all duration-150 outline-none focus:ring-1 focus:ring-blue-500/40 rounded-lg ${isRead && !isSelected ? 'opacity-55' : ''}`}
                        style={topicAccent ? { borderLeft: `3px solid ${topicAccent}` } : undefined}
                      >
                        <StoryCard
                          story={story}
                          index={index}
                          isSelected={isSelected}
                          isRead={isRead}
                          onSelect={(id) => handleStorySelect(id)}
                          onToggleSave={user ? handleToggleSave : undefined}
                        />
                      </div>
                    );
                  })}

                  {/* Infinite Scroll Sentinel */}
                  <div ref={sentinelRef} className="h-4" />
                  {loadingMore && (
                    <div className="flex items-center justify-center py-6 gap-2 text-gray-400 dark:text-slate-500">
                      <RefreshCw size={16} className="animate-spin" />
                      <span className="text-sm">Loading more...</span>
                    </div>
                  )}
                  {!hasMore && stories.length > 0 && (
                    <div className="text-center py-4 text-xs text-gray-400 dark:text-slate-600">
                      All stories loaded
                    </div>
                  )}
                </div>
              )}
            </main>
          </div>
        </Panel>

        <ResizeHandle />

        {/* Reader Pane */}
        <Panel defaultSize={65} minSize={30} id="reader">
          <aside
            ref={readerContainerRef}
            tabIndex={-1}
            className={`h-full bg-[#111d2e] overflow-y-auto custom-scrollbar focus:outline-none transition-all ${focusMode === 'reader' ? 'shadow-[inset_4px_0_0_0_#3b82f6]' : ''}`}
          >
            {selectedStory ? (
              <ReaderPane
                story={selectedStory}
                comments={comments}
                commentsLoading={commentsLoading}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 p-8 text-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                  <Star size={32} className="opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-200 mb-1">Select a Story</h3>
                <p className="text-sm max-w-xs mx-auto">Choose a story from the feed to read its discussion.</p>
              </div>
            )}
          </aside>
        </Panel>

      </PanelGroup>
    </div>
  );
}

export default App;
