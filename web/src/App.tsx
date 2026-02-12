import { useEffect, useState, useRef } from 'react';
import './App.css';
import { StoryCard } from './components/StoryCard';
import { CommentList } from './components/CommentList';
import { RefreshCw, TrendingUp, Clock, Star, Hash, Plus, X, MessageSquare, Moon, Sun } from 'lucide-react';

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
}

// Removed "WPL Cricket"
const DEFAULT_TOPICS = ['Postgres', 'LLM', 'OpenCV', 'Rust', 'Go', 'AI'];

function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'default' | 'latest' | 'votes'>('default');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as 'dark' | 'light';
    }
    return 'dark'; // Default to dark
  });

  // Topics State
  const [topics, setTopics] = useState<string[]>(() => {
    const saved = localStorage.getItem('hn_topics');
    return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
  });
  const [newTopic, setNewTopic] = useState('');

  // Comments State
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Keyboard Navigation State
  const [focusMode, setFocusMode] = useState<'stories' | 'comments' | 'sidebar'>('stories');
  const commentContainerRef = useRef<HTMLElement>(null);
  const storyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync topics to local storage and clean up old "WPL Cricket" if present
  useEffect(() => {
    const saved = localStorage.getItem('hn_topics');
    if (saved) {
      let parsed = JSON.parse(saved);
      if (parsed.includes('WPL Cricket')) {
        parsed = parsed.filter((t: string) => t !== 'WPL Cricket');
        setTopics(parsed);
        localStorage.setItem('hn_topics', JSON.stringify(parsed));
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('hn_topics', JSON.stringify(topics));
  }, [topics]);

  // Keyboard Navigation Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.key === 'ArrowRight') {
        if (focusMode === 'sidebar') {
          setFocusMode('stories');
          e.preventDefault();
          // Focus back on the selected story in the list or the first one
          if (selectedStoryId) {
            const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
            if (currentIndex !== -1 && storyRefs.current[currentIndex]) {
              setTimeout(() => storyRefs.current[currentIndex]?.focus(), 50);
            }
          } else if (stories.length > 0 && storyRefs.current[0]) {
            setTimeout(() => storyRefs.current[0]?.focus(), 50);
          }
        } else if (selectedStoryId && focusMode === 'stories') {
          setFocusMode('comments');
          e.preventDefault();
          // Focus the comment container to enable native scrolling
          setTimeout(() => commentContainerRef.current?.focus(), 50);
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusMode === 'comments') {
          setFocusMode('stories');
          e.preventDefault();
          // Focus back on the selected story in the list
          const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
          if (currentIndex !== -1 && storyRefs.current[currentIndex]) {
            setTimeout(() => storyRefs.current[currentIndex]?.focus(), 50);
          }
        } else if (focusMode === 'stories') {
          setFocusMode('sidebar');
          e.preventDefault();
          // Focus functionality for sidebar (e.g. first button)
          const firstButton = sidebarRef.current?.querySelector('button') as HTMLButtonElement;
          if (firstButton) {
            setTimeout(() => firstButton.focus(), 50);
          }
        }
      } else if (e.key === 'ArrowUp') {
        if (focusMode === 'stories' && stories.length > 0) {
          e.preventDefault();
          const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
          const prevIndex = Math.max(0, currentIndex - 1);
          const newStoryId = stories[prevIndex].id;
          setSelectedStoryId(newStoryId);
          // Also scroll/focus the element
          if (storyRefs.current[prevIndex]) {
            storyRefs.current[prevIndex]?.focus();
          }
        }
      } else if (e.key === 'ArrowDown') {
        if (focusMode === 'stories' && stories.length > 0) {
          e.preventDefault();
          const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
          const nextIndex = Math.min(stories.length - 1, currentIndex + 1);
          const newStoryId = stories[nextIndex].id;
          setSelectedStoryId(newStoryId);
          // Also scroll/focus the element
          if (storyRefs.current[nextIndex]) {
            storyRefs.current[nextIndex]?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stories, selectedStoryId, focusMode]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const baseUrl = import.meta.env.VITE_API_URL || '';
    let url = `${baseUrl}/api/stories?limit=50&sort=${mode}`;
    if (activeTopic) {
      url += `&topic=${encodeURIComponent(activeTopic)}`;
    }

    url += `&_t=${Date.now()}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch stories');
        return res.json();
      })
      .then(data => {
        setStories(data);
        setLoading(false);
        // Auto-select first story if available and nothing selected
        if (data && data.length > 0) {
          setSelectedStoryId(data[0].id);
        }
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [mode, activeTopic, refreshKey]);

  useEffect(() => {
    if (!selectedStoryId) {
      setComments([]);
      return;
    }

    setCommentsLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || '';
    fetch(`${baseUrl}/api/stories/${selectedStoryId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch comments');
        return res.json();
      })
      .then(data => {
        setComments(data.comments || []);
        setCommentsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch comments", err);
        setCommentsLoading(false);
      });
  }, [selectedStoryId, stories]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()]);
      setNewTopic('');
    }
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setTopics(topics.filter(t => t !== topicToRemove));
    if (activeTopic === topicToRemove) {
      setActiveTopic(null);
    }
  };

  const handleStorySelect = (id: number) => {
    setSelectedStoryId(id);
    setFocusMode('stories');
  };

  return (
    <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans selection:bg-orange-200 selection:text-orange-900 overflow-hidden flex flex-col transition-colors duration-200">
      {/* Glass Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-slate-700/50 p-4 sticky top-0 z-50 flex-shrink-0 transition-colors duration-200 relative">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 relative z-10 w-9 h-9">
            {/* Spacer to balance layout */}
          </div>

          {/* Centered Title & Icon */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
            <div className="bg-gradient-to-br from-[#ff6600] to-[#ff8533] text-white font-bold rounded-lg w-9 h-9 flex items-center justify-center text-lg shadow-sm shadow-orange-500/20">Y</div>
            <h1 className="font-bold text-xl tracking-tight text-orange-600 dark:text-orange-500">Hacker News Station</h1>
          </div>

          <div className="flex items-center gap-2 relative z-10">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-100/80 dark:hover:bg-slate-800/80 transition-all text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 active:scale-95"
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 rounded-full hover:bg-gray-100/80 dark:hover:bg-slate-800/80 transition-all text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 active:scale-95"
              title="Refresh Stories"
            >
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside ref={sidebarRef} className="w-64 flex-shrink-0 bg-[#f8fafc] dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 p-6 overflow-y-auto hidden md:block custom-scrollbar transition-colors duration-200 outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500/50" tabIndex={-1}>
          <div className="mb-8">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4 px-3">Feeds</h3>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setMode('default')}
                  onFocus={() => setFocusMode('sidebar')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm font-medium flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${mode === 'default' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-l-4 border-orange-500' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 border-l-4 border-transparent'}`}
                >
                  <Star size={18} /> Front Page
                </button>
              </li>
              <li>
                <button
                  onClick={() => setMode('latest')}
                  onFocus={() => setFocusMode('sidebar')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm font-medium flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${mode === 'latest' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-l-4 border-orange-500' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 border-l-4 border-transparent'}`}
                >
                  <Clock size={18} /> Latest
                </button>
              </li>
              <li>
                <button
                  onClick={() => setMode('votes')}
                  onFocus={() => setFocusMode('sidebar')}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm font-medium flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${mode === 'votes' ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-l-4 border-orange-500' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 border-l-4 border-transparent'}`}
                >
                  <TrendingUp size={18} /> Top Voted
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-4 px-3">Filter by Topic</h3>

            {/* Add Topic Input */}
            <form onSubmit={handleAddTopic} className="mb-4 px-3 flex gap-2">
              <div className="relative flex-1">
                <div className="absolute left-2.5 top-2 text-gray-400"><Hash size={12} /></div>
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onFocus={() => setFocusMode('sidebar')}
                  placeholder="New topic"
                  className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-md pl-7 pr-2 py-1.5 text-xs text-gray-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder-gray-400"
                />
              </div>
              <button
                type="submit"
                disabled={!newTopic.trim()}
                className="bg-gray-100 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-900/30 text-gray-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 border border-gray-200 dark:border-slate-700 rounded-md px-2 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={14} />
              </button>
            </form>

            <ul className="space-y-0.5">
              {topics.map(topic => (
                <li key={topic} className="group relative">
                  <button
                    onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                    onFocus={() => setFocusMode('sidebar')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${activeTopic === topic ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200'}`}
                  >
                    <span className="text-gray-400 dark:text-slate-600 opacity-70">#</span> {topic}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveTopic(topic); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-red-50 dark:hover:bg-slate-800 rounded"
                    title="Remove topic"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main Feed */}
        <main
          className={`flex-1 overflow-y-auto bg-gray-50/50 dark:bg-slate-950 transition-all duration-300 custom-scrollbar outline-none ${focusMode === 'stories' ? 'shadow-[inset_0_0_0_2px_rgba(255,102,0,0.1)]' : ''}`}
        >
          <div className="w-full">
            {loading && (
              <div className="p-20 text-center text-gray-400 dark:text-slate-500 flex flex-col items-center gap-4">
                <div className="animate-spin text-orange-500"><RefreshCw size={32} /></div>
                <p className="font-medium animate-pulse">Loading stories...</p>
              </div>
            )}

            {error && (
              <div className="p-6 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-xl flex items-center gap-3 shadow-sm mx-4 mt-8">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full"><X size={20} /></div>
                <div>
                  <p className="font-semibold">Unable to fetch stories</p>
                  <p className="text-sm opacity-90">{error}</p>
                </div>
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-1">
                {stories.map((story, index) => {
                  const isSelected = selectedStoryId === story.id;
                  const isFocused = isSelected && focusMode === 'stories';
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
                        }
                      }}
                      onFocus={() => {
                        if (selectedStoryId !== story.id) {
                          handleStorySelect(story.id);
                        }
                      }}
                      onClick={() => handleStorySelect(story.id)}
                      className={`transition-all duration-200 border-l-4 outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500/50 ${isSelected ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/5' : 'border-transparent'} ${isFocused ? 'bg-orange-50 dark:bg-orange-500/10' : ''}`}
                    >
                      <StoryCard
                        story={story}
                        index={index}
                        isSelected={isSelected}
                        onSelect={(id) => handleStorySelect(id)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !error && stories.length === 0 && (
              <div className="p-20 text-center text-gray-500 dark:text-slate-400 flex flex-col items-center gap-4">
                <div className="p-4 bg-gray-100 dark:bg-slate-800 rounded-full"><MessageSquare size={32} className="text-gray-400 dark:text-slate-500" /></div>
                <p className="font-medium">No stories found.</p>
              </div>
            )}
          </div>
        </main>

        {/* Comments Sidebar (Right) */}
        {selectedStoryId && (
          <aside
            ref={commentContainerRef}
            tabIndex={-1}
            className={`w-[500px] flex-shrink-0 bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 overflow-y-auto shadow-2xl z-20 transition-all custom-scrollbar outline-none ${focusMode === 'comments' ? 'shadow-[inset_4px_0_0_0_#6366f1]' : ''}`}
          >
            <div className="p-6 pt-2">
              {/* Cleaned up header - no close button row */}

              {commentsLoading ? (
                <div className="flex justify-center p-20">
                  <div className="animate-spin text-indigo-500 dark:text-indigo-400"><RefreshCw size={24} /></div>
                </div>
              ) : (
                <div>
                  {comments.length > 0 ? (
                    <div className="pr-2 pt-2">
                      <CommentList comments={comments} parentId={null} />
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 mt-4">
                      <p className="text-gray-500 dark:text-slate-400 font-medium">No comments yet.</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Be the first to share your thoughts!</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
