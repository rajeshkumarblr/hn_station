import { useEffect, useState, useRef } from 'react';
import './App.css';
import { StoryCard } from './components/StoryCard';
import { CommentList } from './components/CommentList';
import { RefreshCw, TrendingUp, Clock, Star, Hash, Plus, X, MessageSquare, Moon, Sun, ExternalLink } from 'lucide-react';
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
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Keyboard Navigation State
  const [focusMode, setFocusMode] = useState<'stories' | 'reader' | 'sidebar'>('stories');
  const readerContainerRef = useRef<HTMLElement>(null);
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

      if (e.key === ' ') {
        e.preventDefault();
        // Toggle focus between stories and reader
        if (focusMode === 'stories' && selectedStoryId) {
          setFocusMode('reader');
          setTimeout(() => readerContainerRef.current?.focus(), 50);
        } else if (focusMode === 'reader') {
          setFocusMode('stories');
          const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
          if (currentIndex !== -1 && storyRefs.current[currentIndex]) {
            setTimeout(() => storyRefs.current[currentIndex]?.focus(), 50);
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setFocusMode('stories');
        const currentIndex = stories.findIndex(s => s.id === selectedStoryId);
        if (currentIndex !== -1 && storyRefs.current[currentIndex]) {
          setTimeout(() => storyRefs.current[currentIndex]?.focus(), 50);
        }
        return;
      }

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
          setFocusMode('reader');
          e.preventDefault();
          // Focus the reader container to enable native scrolling
          setTimeout(() => readerContainerRef.current?.focus(), 50);
        }
      } else if (e.key === 'ArrowLeft') {
        if (focusMode === 'reader') {
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
        if (data && data.length > 0 && !selectedStoryId) {
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
      setSelectedStory(null);
      return;
    }

    // Find story in list first for immediate update
    const storyInList = stories.find(s => s.id === selectedStoryId);
    if (storyInList) {
      setSelectedStory(storyInList);
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
        if (data.story) {
          setSelectedStory(data.story);
        }
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

  // Resize Handle Component
  const ResizeHandle = ({ id }: { id?: string }) => (
    <PanelResizeHandle
      id={id}
      className="w-2 flex justify-center items-stretch group focus:outline-none"
    >
      <div className="w-[1px] bg-gray-200 dark:bg-slate-800 transition-colors group-hover:bg-blue-500 group-active:bg-blue-600 dark:group-hover:bg-blue-500 delay-75 h-full"></div>
    </PanelResizeHandle>
  );

  // Layout persistence
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'hn-layout-v1',
    storage: localStorage,
  });

  return (
    <div className="h-screen bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans overflow-hidden flex flex-col transition-colors duration-200">

      <PanelGroup
        orientation="horizontal"
        id="hn-layout-v1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >

        {/* Sidebar Panel */}
        <Panel defaultSize={15} minSize={10} collapsible={true} className="flex flex-col" id="sidebar">
          <aside ref={sidebarRef} className="h-full bg-[#f8fafc] dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 p-4 overflow-y-auto custom-scrollbar focus:outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500/50" tabIndex={-1}>
            {/* Header Brand */}
            <div className="flex items-center gap-3 mb-8 px-2">
              <div className="bg-gradient-to-br from-[#ff6600] to-[#ff8533] text-white font-bold rounded-lg w-8 h-8 flex items-center justify-center text-lg shadow-sm shadow-orange-500/20 shrink-0">Y</div>
              <h1 className="font-bold text-lg tracking-tight text-orange-600 dark:text-orange-500">HN Station</h1>
            </div>

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

            {/* Theme Toggle Bottom */}
            <div className="mt-8 px-3 pt-4 border-t border-gray-200 dark:border-slate-800">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          </aside>
        </Panel>

        <ResizeHandle />

        {/* Feed Panel */}
        <Panel defaultSize={40} minSize={30} id="feed">
          <div className="h-full flex flex-col bg-gray-50/50 dark:bg-slate-950">
            {/* Feed Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-20">
              <h2 className="font-semibold text-gray-900 dark:text-slate-200">
                {activeTopic ? `#${activeTopic}` : (mode === 'latest' ? 'Latest Stories' : (mode === 'votes' ? 'Top Voted' : 'Front Page'))}
              </h2>
              <button
                onClick={handleRefresh}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 dark:text-slate-400 transition-all"
                title="Refresh"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Feed List */}
            <main
              className={`flex-1 overflow-y-auto custom-scrollbar p-3 transition-all ${focusMode === 'stories' ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.5)]' : ''}`}
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
                <div className="space-y-2">
                  {stories.map((story, index) => {
                    const isSelected = selectedStoryId === story.id;
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
                        onClick={() => handleStorySelect(story.id)}
                        className={`rounded-lg transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-500/50 ${isSelected ? 'ring-2 ring-blue-500 dark:ring-blue-400 bg-white dark:bg-slate-800 shadow-sm z-10' : 'hover:bg-white dark:hover:bg-slate-900'}`}
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
            </main>
          </div>
        </Panel>

        <ResizeHandle />

        {/* Reader Panel (Right) */}
        <Panel defaultSize={45} minSize={20} id="reader">
          <aside
            ref={readerContainerRef}
            tabIndex={-1}
            className={`h-full bg-white dark:bg-slate-900 overflow-y-auto custom-scrollbar focus:outline-none transition-all ${focusMode === 'reader' ? 'shadow-[inset_4px_0_0_0_#3b82f6]' : ''}`}
          >
            {selectedStory ? (
              <div className="flex flex-col min-h-full">
                {/* Reader Header */}
                <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-gray-100 dark:border-slate-800 p-6 pb-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100 leading-snug">
                      {selectedStory.title}
                    </h1>
                    <a
                      href={selectedStory.url || `https://news.ycombinator.com/item?id=${selectedStory.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg bg-gray-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0"
                      title="Open Link"
                    >
                      <ExternalLink size={20} />
                    </a>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
                    <span>{selectedStory.score} points</span>
                    <span>by <span className="text-gray-700 dark:text-slate-300 font-medium">{selectedStory.by}</span></span>
                    <span>{new Date(selectedStory.time).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Comments / Content */}
                <div className="p-6 pt-4 flex-1">
                  {commentsLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
                      <RefreshCw size={24} className="animate-spin" />
                      <span>Loading discussion...</span>
                    </div>
                  ) : (
                    <>
                      {comments.length > 0 ? (
                        <CommentList comments={comments} parentId={null} />
                      ) : (
                        <div className="text-center py-20 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
                          <MessageSquare size={32} className="mx-auto text-gray-300 dark:text-slate-600 mb-2" />
                          <p className="text-gray-500 dark:text-slate-400">No comments yet.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-slate-500 p-8 text-center bg-gray-50/30 dark:bg-slate-900/30">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                  <Star size={32} className="opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-slate-200 mb-1">Select a Story</h3>
                <p className="text-sm max-w-xs mx-auto">Choose a story from the feed to view its discussion and details here.</p>
              </div>
            )}
          </aside>
        </Panel>

      </PanelGroup>
    </div>
  );
}

export default App;
