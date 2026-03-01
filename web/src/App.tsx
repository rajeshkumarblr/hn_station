import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import './App.css';
import { StoryCard, getTagStyle } from './components/StoryCard';

import { ReaderPane } from './components/ReaderPane';
import { FilterSidebar } from './components/FilterSidebar';
import { SettingsModal } from './components/SettingsModal';
import { AdminDashboard } from './components/AdminDashboard';
import { RefreshCw, X, Moon, Sun, LogIn, LogOut, TrendingUp, Clock, Trophy, Monitor, Bookmark, Github, Settings, Shield } from 'lucide-react';

export interface Story {
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
  is_hidden?: boolean;
  summary?: string;
  topics?: string[];
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

type ModeKey = typeof MODES[number]['key'];

const PAGE_SIZE = 10;
const MAX_READ_IDS = 500;

// Check which active topic (if any) matches a story's tags
function getStoryTopicMatch(storyTitle: string, storyTopics: string[] | undefined, activeTopics: string[]): string | null {
  const titleLower = storyTitle.toLowerCase();
  for (const active of activeTopics) {
    const activeLower = active.toLowerCase();
    // Match in title
    if (titleLower.includes(activeLower)) return active;
    // Match in topics
    if (storyTopics) {
      for (const t of storyTopics) {
        if (t.toLowerCase() === activeLower) return active;
      }
    }
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
  // Stream buffer — accumulates stories across fetches
  const [storyBuffer, setStoryBuffer] = useState<Story[]>([]);
  const [bufferOffset, setBufferOffset] = useState(0); // how many we've fetched
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ModeKey>('default');
  const [activeTopics, setActiveTopics] = useState<string[]>(loadTopicChips);
  const [totalStories, setTotalStories] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  // fetchingMore prevents duplicate refill fetches
  const [fetchingMore, setFetchingMore] = useState(false);

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
  const [highlightedStoryId, setHighlightedStoryId] = useState<number | null>(null);
  const [readerTab, setReaderTab] = useState<'discussion' | 'article'>('article');
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Hidden stories
  const [showHidden, setShowHidden] = useState(false);
  // hiddenStories set is no longer needed — removed items are spliced from buffer
  const hiddenStories = new Set<number>();

  // Derived display list: first PAGE_SIZE entries from the buffer
  const stories = useMemo(() => {
    return storyBuffer.slice(0, PAGE_SIZE);
  }, [storyBuffer]);

  // Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'feed' | 'reader'>('feed');
  const [readingQueue, setReadingQueue] = useState<number[]>([]);

  const readerContainerRef = useRef<HTMLElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);
  const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  // Hide a story (Hoist this up so it can be used in key handlers)
  const handleHideStory = (id: number) => {
    setStoryBuffer(prev => {
      const next = prev.filter(s => s.id !== id);
      return next;
    });

    // Trigger refill if buffer is now shallow
    setBufferOffset(prev => prev); // forces refill check via effect

    // Persist hidden state to server
    if (user) {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      fetch(`${baseUrl}/api/stories/${id}/interact`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: true }),
      }).catch(() => { });
    }

    // Auto-select next visible story if the hidden one was selected
    if (selectedStoryId === id) {
      const visible = storyBuffer.filter(s => !hiddenStories.has(s.id) && s.id !== id);
      const nextStory = visible[0] ?? null;
      if (nextStory) setSelectedStoryId(nextStory.id);
      else setSelectedStoryId(null);
    }
  };



  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Queue handler
  const handleToggleQueue = (id: number) => {
    setReadingQueue(prev => {
      if (prev.includes(id)) return prev.filter(q => q !== id);
      return [...prev, id];
    });
  };

  const handleNextStory = useCallback(() => {
    // If user has a custom reading queue, navigate within it
    if (readingQueue.length > 0) {
      const idx = readingQueue.indexOf(selectedStoryId as number);
      if (idx === -1) return;
      const next = Math.min(readingQueue.length - 1, idx + 1);
      if (readingQueue[next] !== selectedStoryId) {
        handleStorySelect(readingQueue[next]);
      }
      return;
    }
    // Default: navigate within the full stories list
    const idx = stories.findIndex(s => s.id === selectedStoryId);
    if (idx === -1 || idx >= stories.length - 1) return;
    handleStorySelect(stories[idx + 1].id);
  }, [stories, selectedStoryId, readingQueue]);

  const handlePrevStory = useCallback(() => {
    // If user has a custom reading queue, navigate within it
    if (readingQueue.length > 0) {
      const idx = readingQueue.indexOf(selectedStoryId as number);
      if (idx === -1) return;
      const prev = Math.max(0, idx - 1);
      if (readingQueue[prev] !== selectedStoryId) {
        handleStorySelect(readingQueue[prev]);
      }
      return;
    }
    // Default: navigate within the full stories list
    const idx = stories.findIndex(s => s.id === selectedStoryId);
    if (idx <= 0) return;
    handleStorySelect(stories[idx - 1].id);
  }, [stories, selectedStoryId, readingQueue]);

  const handleRefresh = () => setRefreshKey(prev => prev + 1);
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleStorySelect = useCallback((id: number) => {
    setSelectedStoryId(id);
    setCurrentView('reader');
    // Default to 'web' tab if the story has a URL, else show discussion
    const story = storyBuffer.find(s => s.id === id);
    // Default to article tab (web/reader are sub-modes within it); fall back to discussion for HN-only posts
    setReaderTab(story?.url ? 'article' : 'discussion');
    // Mark as read (local)
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
    localStorage.setItem('hn_last_story_id', id.toString());
    // Mark as read (server, if logged in)
    if (user) {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      fetch(`${baseUrl}/api/stories/${id}/interact`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => { });
      // Update local story state
      setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_read: true } : s));
    }
  }, [user, storyBuffer]);

  // Toggle save/unsave a story
  const handleToggleSave = useCallback((id: number, saved: boolean) => {
    if (!user) return;

    // Optimistic update for stories list
    setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_saved: saved } : s));

    // ALSO update selectedStory if it's the one being toggled for immediate UI feedback in ReaderPane
    if (selectedStory && selectedStory.id === id) {
      setSelectedStory(prev => prev ? { ...prev, is_saved: saved } : null);
    }

    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/stories/${id}/interact`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved }),
    }).catch(() => {
      // Revert on failure
      setStoryBuffer(prev => prev.map(s => s.id === id ? { ...s, is_saved: !saved } : s));
      if (selectedStory && selectedStory.id === id) {
        setSelectedStory(prev => prev ? { ...prev, is_saved: !saved } : null);
      }
    });
  }, [user, selectedStory]);

  const handleStoryInteractWithQueue = useCallback((storyId: number, matchedTopic: string | null) => {
    let newQueue = [...readingQueue];
    const isQueued = readingQueue.includes(storyId);

    // If this story is colored (matches a topic), inject all currently matching stories into queue
    if (matchedTopic) {
      const matchingIds = stories
        .filter(s => getStoryTopicMatch(s.title, s.topics, [matchedTopic]) !== null)
        .filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden))
        .map(s => s.id);

      matchingIds.forEach(id => {
        if (!newQueue.includes(id)) newQueue.push(id);
      });
      // Ensure the clicked story is in the queue
      if (!newQueue.includes(storyId)) newQueue.push(storyId);
    } else if (!isQueued) {
      newQueue.push(storyId);
    }

    setReadingQueue(newQueue);
    handleStorySelect(storyId);
  }, [readingQueue, stories, showHidden, hiddenStories, handleStorySelect]);

  const handleQueueAllFiltered = () => {
    if (activeTopics.length === 0) return;

    const matchedIds = stories
      .filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden))
      .filter(s => {
        const matched = getStoryTopicMatch(s.title, s.topics, activeTopics);
        return matched !== null && !readingQueue.includes(s.id);
      })
      .map(s => s.id);

    if (matchedIds.length > 0) {
      setReadingQueue(prev => [...prev, ...matchedIds]);
    }
  };

  // Keyboard Navigation Logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') target.blur();
        return;
      }

      // 1. Navigation within Feed (Up/Down)
      if (e.key === 'ArrowDown' || e.key === 'j') {
        if (!selectedStoryId) {
          e.preventDefault();
          setHighlightedStoryId(prev => {
            if (!prev && stories.length > 0) return stories[0].id;
            const idx = stories.findIndex(s => s.id === prev);
            if (idx === -1) return stories[0]?.id || null;
            const nextIdx = Math.min(stories.length - 1, idx + 1);
            return stories[nextIdx].id;
          });
        }
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        if (!selectedStoryId) {
          e.preventDefault();
          setHighlightedStoryId(prev => {
            if (!prev && stories.length > 0) return stories[0].id;
            const idx = stories.findIndex(s => s.id === prev);
            if (idx <= 0) return stories[0]?.id || null;
            return stories[idx - 1].id;
          });
        }
      }

      // 2. Open Highlighted Story (Enter)
      else if (e.key === 'Enter' && highlightedStoryId && !selectedStoryId) {
        e.preventDefault();
        handleStorySelect(highlightedStoryId);
      }

      // 3. Close Reader (Escape or Ctrl+Left)
      else if (e.key === 'Escape' || (e.ctrlKey && e.key === 'ArrowLeft')) {
        e.preventDefault();
        if (selectedStoryId) {
          setSelectedStoryId(null);
          setSelectedStory(null);
          setCurrentView('feed');
        }
      }

      // 4. Tab Switching (Ctrl+Tab)
      else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (selectedStoryId) {
          setReaderTab(prev => prev === 'article' ? 'discussion' : 'article');
        }
      }

      // 5. Global Search shortcut (/)
      else if (e.key === '/') {
        e.preventDefault();
        topicInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stories, highlightedStoryId, selectedStoryId, handleStorySelect]);

  // Sync highlighting with selection
  useEffect(() => {
    if (selectedStoryId) {
      setHighlightedStoryId(selectedStoryId);
    }
  }, [selectedStoryId]);

  // Initial highlighting
  useEffect(() => {
    if (!highlightedStoryId && stories.length > 0) {
      setHighlightedStoryId(stories[0].id);
    }
  }, [stories, highlightedStoryId]);

  // Derive the display list was moved higher — skip duplicate here

  // Fetch stories — populates / replaces the buffer on mode/offset/refresh changes
  const buildUrl = useCallback((currentOffset: number, limit: number = PAGE_SIZE * 2) => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    if (mode === 'saved') {
      return `${baseUrl}/api/stories/saved?limit=${limit}&offset=${currentOffset}&_t=${Date.now()}`;
    }
    let url = `${baseUrl}/api/stories?limit=${limit}&offset=${currentOffset}&sort=${mode}`;
    if (showHidden) url += `&show_hidden=true`;
    return url;
  }, [mode, showHidden]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setHasMore(true);
    // Reset buffer on mode/sort/refresh change but NOT on bufferOffset change
    setStoryBuffer([]);
    setBufferOffset(0);
  }, [mode, refreshKey, showHidden]);

  // Main fetch — fires when bufferOffset changes or on reset
  useEffect(() => {
    if (bufferOffset === 0) return; // handled by reset+fetch below
    if (!hasMore || fetchingMore) return;

    setFetchingMore(true);
    fetch(buildUrl(bufferOffset))
      .then(res => { if (!res.ok) throw new Error('Failed'); return res.json(); })
      .then(data => {
        const incoming: Story[] = data.stories || [];
        setStoryBuffer(prev => {
          // Deduplicate
          const existingIds = new Set(prev.map(s => s.id));
          const fresh = incoming.filter(s => !existingIds.has(s.id));
          return [...prev, ...fresh];
        });
        setHasMore(incoming.length >= PAGE_SIZE);
        setFetchingMore(false);
      })
      .catch(() => setFetchingMore(false));
  }, [bufferOffset]);

  // Initial load (and reset)
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
            setSelectedStoryId(exists ? id : incoming[0].id);
          } else {
            setSelectedStoryId(incoming[0].id);
          }
          setCurrentView('feed');
        }
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [mode, refreshKey, showHidden]);

  // Auto-refill: when buffer runs low, fetch more
  useEffect(() => {
    const REFILL_THRESHOLD = PAGE_SIZE + 2;
    const visibleCount = storyBuffer.filter(s => !hiddenStories.has(s.id)).length;
    if (!fetchingMore && hasMore && visibleCount < REFILL_THRESHOLD && storyBuffer.length > 0) {
      const nextOffset = storyBuffer.length;
      setBufferOffset(nextOffset);
    }
  }, [storyBuffer, hiddenStories, hasMore, fetchingMore]);

  // Extract available tags from current page
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    stories.forEach(story => {
      if (story.topics) {
        story.topics.forEach(t => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [stories]);

  // Fetch comments
  useEffect(() => {
    if (!selectedStoryId) {
      setComments([]);
      setSelectedStory(null);
      return;
    }

    const storyInList = stories.find(s => s.id === selectedStoryId);
    if (storyInList) {
      setSelectedStory(storyInList);
    }

    setCommentsLoading(true);
    setComments([]); // Clear immediately to prevent stale data

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

  return (
    <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">

      {/* ─── Zen Header ─── */}
      <header className="bg-[#1a2332] border-b border-slate-700 px-5 flex-shrink-0 z-50 h-16 relative">
        <div className="flex items-center h-full">

          {/* Left — Nav Tabs */}
          <nav className="h-full flex items-center gap-6 flex-1">
            {MODES.map((m, i) => {
              const Icon = m.icon;
              const isActive = mode === m.key;
              return (
                <button
                  key={m.key}
                  ref={el => modeButtonRefs.current[i] = el}
                  onClick={() => {
                    if (mode === m.key) {
                      handleRefresh();
                    } else {
                      setMode(m.key);
                      setOffset(0);
                    }
                  }}
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

          {/* Center — Brand (absolute so it is always the exact midpoint of the bar) */}
          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none">
            <button
              onClick={() => { setCurrentView('feed'); }}
              className="font-bold text-lg tracking-tight text-orange-400 hover:text-orange-300 transition-colors cursor-pointer leading-tight pointer-events-auto"
              title="Return to Feed"
            >
              HN Station
            </button>
            <span className="text-[10px] text-slate-500 font-normal tracking-widest mt-0.5">v3.3</span>
          </div>

          {/* Spacer — pushes right controls to the far right */}
          <div className="flex-1 min-w-0"></div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => { handleRefresh(); setOffset(0); }}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <a
              href="https://github.com/rajeshkumarblr/hn_station"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors active:scale-95"
              title="View Source Code"
            >
              <Github size={16} />
            </a>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
              title={theme === 'dark' ? "Light Mode" : "Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-all active:scale-95"
              title="Settings"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => { setShowHidden(!showHidden); setOffset(0); }}
              className={`p-2 rounded-lg transition-all active:scale-95 ${showHidden ? 'bg-orange-500/20 text-orange-500' : 'hover:bg-slate-800 text-slate-400'}`}
              title={showHidden ? "Hide deleted stories" : "Show all stories"}
            >
              {/* Using Eye/EyeOff or similar icon. Using generic View icon for now if lucide-react has it, otherwise ToggleLeft/Right */}
              {showHidden ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></svg>
              )}
            </button>

            {/* User Auth */}
            {user ? (
              <div className="flex items-center gap-2 ml-1">
                {user.is_admin && (
                  <button
                    onClick={() => setIsAdminModalOpen(true)}
                    className="flex items-center justify-center p-2 mr-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-95 shadow-sm"
                    title="Admin Dashboard"
                  >
                    <Shield size={14} />
                  </button>
                )}
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

      {/* ─── Main Content Area ─── */}
      <div className="flex-1 flex overflow-hidden relative">

        {currentView === 'feed' ? (
          <main
            className="flex-1 overflow-hidden bg-white dark:bg-slate-950 flex justify-center focus:outline-none"
            tabIndex={-1}
          >
            <div className="flex w-full max-w-[85rem] h-full relative">
              {/* Main Feed Column */}
              <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                  <div className="w-full flex justify-center">
                    <div className="w-full max-w-4xl flex flex-col">
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
                        <div className="space-y-0.5">
                          {stories
                            .filter(s => showHidden || (!hiddenStories.has(s.id) && !s.is_hidden))
                            .map((story, index) => {
                              const isSelected = selectedStoryId === story.id;
                              const isRead = readIds.has(story.id) || story.is_read;
                              const isQueued = readingQueue.includes(story.id);

                              const matchedTopic = activeTopics.length > 0 ? getStoryTopicMatch(story.title, story.topics, activeTopics) : null;
                              const tagStyle = matchedTopic ? getTagStyle(matchedTopic) : null;
                              const titleColorStyle = tagStyle ? tagStyle.color : null;
                              // Keep legacy topicTextClass as fallback (not used when titleColorStyle is set)
                              const topicTextClass = null;

                              return (
                                <div
                                  key={story.id}
                                  ref={el => storyRefs.current[index] = el}
                                  tabIndex={0}
                                  role="button"
                                  aria-selected={isSelected}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleStoryInteractWithQueue(story.id, matchedTopic);
                                      setTimeout(() => readerContainerRef.current?.focus(), 50);
                                    }
                                  }}
                                  onClick={() => handleStoryInteractWithQueue(story.id, matchedTopic)}
                                  onDoubleClick={() => {
                                    const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  }}
                                  className={`transition-all duration-150 outline-none focus:ring-1 focus:ring-blue-500/40 rounded-lg ${isRead && !isSelected ? '' : ''}`}
                                  style={tagStyle ? { borderLeft: `3px solid ${tagStyle.color}` } : undefined}
                                >
                                  <StoryCard
                                    story={story}
                                    index={index}
                                    isSelected={isSelected}
                                    isRead={isRead}
                                    isQueued={isQueued}
                                    isEven={index % 2 === 0}
                                    titleColorStyle={titleColorStyle}
                                    topicTextClass={topicTextClass}
                                    onSelect={(id) => handleStorySelect(id)}
                                    onToggleSave={user ? handleToggleSave : undefined}
                                    onHide={handleHideStory}
                                    onQueueToggle={handleToggleQueue}
                                  />
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pagination Controls Fixed at Bottom */}
                {!loading && !error && (
                  <div className="shrink-0 w-full bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800/60 flex justify-center">
                    <div className="w-full max-w-4xl flex justify-center items-center px-6 py-4 gap-2">
                      <button
                        onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                        disabled={offset === 0}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                      >
                        Prev
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.ceil(totalStories / PAGE_SIZE) }, (_, i) => i + 1).map(p => {
                          const pageOffset = (p - 1) * PAGE_SIZE;
                          const isActive = offset === pageOffset;
                          return (
                            <button
                              key={p}
                              onClick={() => setOffset(pageOffset)}
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
                        onClick={() => setOffset(offset + PAGE_SIZE)}
                        disabled={!hasMore}
                        className="px-3 py-1.5 text-xs font-semibold rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Sidebar */}
              <FilterSidebar
                activeTopics={activeTopics}
                setActiveTopics={setActiveTopics}
                getQueuedCount={() => readingQueue.length}
                onQueueAll={handleQueueAllFiltered}
                availableTags={availableTags}
              />
            </div>
          </main>
        ) : (
          <div className="flex-1 w-full bg-[#111d2e]">
            {selectedStory ? (
              <aside
                ref={readerContainerRef}
                tabIndex={-1}
                className="flex-1 w-full h-full overflow-y-auto custom-scrollbar focus:outline-none transition-all"
              >
                <ReaderPane
                  story={selectedStory}
                  comments={comments}
                  commentsLoading={commentsLoading}
                  activeTab={readerTab}
                  onTabChange={setReaderTab}
                  initialActiveCommentId={(() => {
                    try {
                      const progress = JSON.parse(localStorage.getItem('hn_story_progress') || '{}');
                      return progress[selectedStory.id] || null;
                    } catch { return null; }
                  })()}
                  onFocusList={() => setCurrentView('feed')}
                  onTakeFocus={() => { }}
                  onSaveProgress={(commentId) => {
                    try {
                      const progress = JSON.parse(localStorage.getItem('hn_story_progress') || '{}');
                      progress[selectedStory.id] = commentId;
                      localStorage.setItem('hn_story_progress', JSON.stringify(progress));
                    } catch { }
                  }}
                  onToggleSave={user ? handleToggleSave : undefined}
                  onPrev={handlePrevStory}
                  onNext={handleNextStory}
                  onSelectStory={handleStorySelect}
                  stories={stories}
                  onBackToFeed={() => setCurrentView('feed')}
                  onHide={(id) => {
                    handleHideStory(id);
                    setCurrentView('feed');
                  }}
                />
              </aside>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 bg-[#111d2e]">
                Loading story...
              </div>
            )}
          </div>
        )}

        {/* Admin Modal Panel */}
        {
          isAdminModalOpen && (
            <AdminDashboard onClose={() => setIsAdminModalOpen(false)} />
          )
        }
      </div >

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        user={user}
      />
    </div >
  );
}

export default App;
