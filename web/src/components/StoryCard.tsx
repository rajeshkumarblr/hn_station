export interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string; // ISO string from backend
    created_at: string;
    hn_rank?: number;
}

interface StoryCardProps {
    story: Story;
    index?: number; // Optional index if rank is missing
    onSelect?: (id: number) => void;
    isSelected?: boolean;
}

export function StoryCard({ story, index, onSelect, isSelected }: StoryCardProps) {
    let domain = '';
    try {
        if (story.url) {
            domain = new URL(story.url).hostname.replace(/^www\./, '');
        }
    } catch (e) {
        // ignore invalid urls
    }

    const date = new Date(story.time);
    const timeAgo = getTimeAgo(date);

    // Use hn_rank if available, otherwise fallback to index + 1 if provided
    const displayRank = story.hn_rank || (index !== undefined ? index + 1 : null);

    return (
        <div className={`group relative bg-white dark:bg-slate-800/50 dark:border-slate-700/50 rounded-lg p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-transparent hover:border-gray-100 dark:hover:border-slate-600 backdrop-blur-sm ${isSelected ? 'ring-1 ring-orange-500/50 dark:ring-orange-400/50 bg-orange-50/30 dark:bg-orange-900/10' : ''}`}>
            <div className="relative z-10 pr-2">
                <h3 className={`text-base text-gray-900 dark:text-slate-200 leading-snug mb-1 ${isSelected ? 'font-bold' : 'font-medium'}`}>
                    {displayRank && (
                        <span className="text-gray-400 dark:text-slate-500 font-normal mr-2 select-none">
                            {displayRank}.
                        </span>
                    )}
                    <a
                        href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[#ff6600] dark:hover:text-[#ff6600] transition-colors"
                    >
                        {story.title}
                    </a>
                </h3>

                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-slate-400 font-medium">
                    {domain && (
                        <div className="flex items-center gap-1 text-gray-400 dark:text-slate-500">
                            <span className="truncate max-w-[150px] hover:text-gray-600 dark:hover:text-slate-300 transition-colors">{domain}</span>
                            <span className="text-gray-300 dark:text-slate-600">•</span>
                        </div>
                    )}

                    <span className="flex items-center gap-1 text-[#ff6600]">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                        {story.score}
                    </span>

                    <span className="flex items-center gap-1">
                        {story.by}
                    </span>

                    <span className="flex items-center gap-1" title={date.toLocaleString()}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        {timeAgo}
                    </span>

                    <button
                        onClick={(e) => { e.stopPropagation(); onSelect && onSelect(story.id); }}
                        className={`flex items-center gap-1 transition-colors px-2 py-0.5 rounded-full ${story.descendants > 0 ? 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-slate-300'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        {story.descendants > 0 ? `${story.descendants}` : 'discuss'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s";
}
