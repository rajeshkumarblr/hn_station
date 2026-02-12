import { useEffect, useState } from 'react';
import './App.css';
import { StoryCard } from './components/StoryCard';
import { CommentList } from './components/CommentList';

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

const DEFAULT_TOPICS = ['Postgres', 'LLM', 'OpenCV', 'WPL Cricket', 'Rust', 'Go', 'AI'];

function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<'default' | 'latest' | 'votes'>('default');
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Topics State
  const [topics, setTopics] = useState<string[]>(() => {
    const saved = localStorage.getItem('hn_topics');
    return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
  });
  const [newTopic, setNewTopic] = useState('');
  const [isAddingTopic, setIsAddingTopic] = useState(false);

  // Comments State
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    // Apply dark mode class to html element
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    localStorage.setItem('hn_topics', JSON.stringify(topics));
  }, [topics]);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const baseUrl = import.meta.env.VITE_API_URL || '';
    let url = `${baseUrl}/api/stories?limit=50&sort=${mode}`;
    if (activeTopic) {
      url += `&topic=${encodeURIComponent(activeTopic)}`;
    }

    // Add timestamp to prevent caching
    url += `&_t=${Date.now()}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch stories');
        return res.json();
      })
      .then(data => {
        setStories(data);
        setLoading(false);
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

    // Find story in current list if available, otherwise fetch it (or just rely on API)
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
        // Update story details from detailed API response if needed
        if (data.story) {
          setSelectedStory(data.story);
        }
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

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTopic.trim() && !topics.includes(newTopic.trim())) {
      setTopics([...topics, newTopic.trim()]);
      setNewTopic('');
      setIsAddingTopic(false);
    }
  };

  const handleRemoveTopic = (topicToRemove: string) => {
    setTopics(topics.filter(t => t !== topicToRemove));
    if (activeTopic === topicToRemove) {
      setActiveTopic(null);
    }
  };

  return (
    <div className="h-screen bg-gray-900 text-gray-200 font-sans selection:bg-orange-500 selection:text-white overflow-hidden flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-10 shadow-lg flex-shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#ff6600] text-white font-bold p-1 rounded-sm w-8 h-8 flex items-center justify-center text-lg">Y</div>
            <h1 className="font-bold text-xl tracking-tight text-white">Hacker News Station</h1>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors text-sm font-medium text-gray-200"
            title="Refresh Stories"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" /></svg>
            Refresh
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 bg-[#0b1120] border-r border-gray-800 p-6 overflow-y-auto hidden md:block custom-scrollbar">
          <div className="mb-8">
            <h3 className="font-bold text-gray-500 uppercase text-xs mb-4 tracking-wider">Feeds</h3>
            <ul className="space-y-1">
              <li><button onClick={() => setMode('default')} className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm font-medium ${mode === 'default' ? 'bg-[#ff6600]/10 text-[#ff6600]' : 'text-gray-400 hover:bg-gray-800'}`}>Front Page</button></li>
              <li><button onClick={() => setMode('latest')} className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm font-medium ${mode === 'latest' ? 'bg-[#ff6600]/10 text-[#ff6600]' : 'text-gray-400 hover:bg-gray-800'}`}>Latest</button></li>
              <li><button onClick={() => setMode('votes')} className={`w-full text-left px-3 py-2 rounded-md transition-colors text-sm font-medium ${mode === 'votes' ? 'bg-[#ff6600]/10 text-[#ff6600]' : 'text-gray-400 hover:bg-gray-800'}`}>Top Voted</button></li>
            </ul>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider">Topics</h3>
              <button onClick={() => setIsAddingTopic(!isAddingTopic)} className="text-gray-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>

            {isAddingTopic && (
              <form onSubmit={handleAddTopic} className="mb-4">
                <input
                  type="text"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  placeholder="Add topic..."
                  autoFocus
                  className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#ff6600] placeholder-gray-600"
                />
              </form>
            )}

            <ul className="space-y-1">
              {topics.map(topic => (
                <li key={topic} className="group relative">
                  <button
                    onClick={() => setActiveTopic(activeTopic === topic ? null : topic)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors pr-8 ${activeTopic === topic ? 'bg-indigo-500/20 text-indigo-400 font-medium' : 'text-gray-400 hover:bg-gray-800'}`}
                  >
                    # {topic}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveTopic(topic); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Remove topic"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Main Feed */}
        <main className={`flex-1 overflow-y-auto bg-gray-900 p-6 transition-all duration-300 custom-scrollbar ${selectedStoryId ? 'w-1/2' : 'w-full'}`}>
          <div className="max-w-4xl mx-auto">
            {loading && <div className="p-12 text-center text-gray-500">Loading stories...</div>}
            {error && <div className="p-8 text-red-400 bg-red-900/10 border-l-4 border-red-500">Error: {error}</div>}

            {!loading && !error && (
              <ol className="list-decimal pl-6 space-y-4 text-gray-500 font-mono text-sm">
                {stories.map((story) => (
                  <li key={story.id} className="pl-2">
                    <div className={`font-sans text-base p-2 rounded-lg transition-colors ${selectedStoryId === story.id ? 'bg-gray-800' : ''}`}>
                      <StoryCard story={story} onSelect={(id) => setSelectedStoryId(id === selectedStoryId ? null : id)} />
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {!loading && !error && stories.length === 0 && (
              <div className="p-16 text-center text-gray-500">
                No stories found.
              </div>
            )}
          </div>
        </main>

        {/* Comments Sidebar (Right) */}
        {selectedStoryId && (
          <aside className="w-[500px] flex-shrink-0 bg-gray-800 border-l border-gray-700 overflow-y-auto shadow-xl z-20 transition-all custom-scrollbar">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-lg font-bold text-gray-200">
                  Discussion
                </h2>
                <button onClick={() => setSelectedStoryId(null)} className="text-gray-400 hover:text-white p-1 hover:bg-gray-700 rounded-md">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {commentsLoading ? (
                <div className="flex justify-center p-10">
                  <div className="animate-spin h-6 w-6 border-2 border-gray-500 border-t-[#ff6600] rounded-full"></div>
                </div>
              ) : (
                <div>
                  {selectedStory && (
                    <div className="mb-6 pb-6 border-b border-gray-700">
                      <h3 className="text-md font-medium text-gray-100 mb-2">{selectedStory.title}</h3>
                      <a href={selectedStory.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#ff6600] hover:underline break-all block mb-2">{selectedStory.url}</a>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>{selectedStory.score} points</span>
                        <span>by {selectedStory.by}</span>
                        <span>{comments.length} comments loaded</span>
                      </div>
                    </div>
                  )}

                  {comments.length > 0 ? (
                    <CommentList comments={comments} parentId={null} />
                  ) : (
                    <div className="text-center text-gray-500 py-10">
                      {commentsLoading ? 'Loading comments...' : 'No comments yet.'}
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
