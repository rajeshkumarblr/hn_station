import { useEffect, useState } from 'react';
import { StoryCard } from './components/StoryCard';
import type { Story } from './components/StoryCard';

function App() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'top' | 'new'>('top');

  useEffect(() => {
    setLoading(true);
    fetch(`http://localhost:8080/api/stories?limit=50&sort=${sort}`)
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
  }, [sort]);

  return (
    <div className="min-h-screen bg-[#f6f6ef] font-verdana text-[10pt] text-black">
      <div className="mx-auto md:w-[85%] bg-[#f6f6ef]">
        <header className="bg-[#ff6600] p-[2px] flex items-center mb-[10px]">
          <div className="border border-white p-[1px] mr-[5px]">
            <span className="font-bold text-white px-1">Y</span>
          </div>
          <span className="font-bold mr-[10px]">Hacker News Station</span>
          <nav className="text-black text-[10pt]">
            <button
              onClick={() => setSort('top')}
              className={`hover:underline ${sort === 'top' ? 'text-white' : 'text-black'}`}
            >
              new
            </button>
            <span className="px-1">|</span>
            <button
              onClick={() => setSort('new')}
              className={`hover:underline ${sort === 'new' ? 'text-white' : 'text-black'}`}
            >
              past
            </button>
            <span className="px-1">|</span>
            <a href="#" className="hover:underline">comments</a>
            <span className="px-1">|</span>
            <a href="#" className="hover:underline">ask</a>
            <span className="px-1">|</span>
            <a href="#" className="hover:underline">show</a>
            <span className="px-1">|</span>
            <a href="#" className="hover:underline">jobs</a>
            <span className="px-1">|</span>
            <a href="#" className="hover:underline">submit</a>
          </nav>
        </header>

        <main className="px-2">
          {loading && <p>Loading...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}

          {!loading && !error && (
            <ol className="list-decimal list-outside pl-6 space-y-1">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </ol>
          )}

          <div className="ml-6 mt-4 pb-4">
            <a href="#" className="text-black hover:underline font-bold">More</a>
          </div>
        </main>

        <footer className="border-t-2 border-[#ff6600] mt-8 pt-2 text-center text-[10px] text-[#828282]">
          <p>Applications are open for YC Summer 2026</p>
          <div className="mt-2 space-x-2">
            <a href="#" className="hover:underline">Guidelines</a> |
            <a href="#" className="hover:underline">FAQ</a> |
            <a href="#" className="hover:underline">Lists</a> |
            <a href="#" className="hover:underline">API</a> |
            <a href="#" className="hover:underline">Security</a> |
            <a href="#" className="hover:underline">Legal</a> |
            <a href="#" className="hover:underline">Apply to YC</a> |
            <a href="#" className="hover:underline">Contact</a>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App;
