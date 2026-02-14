import { Star, Terminal } from 'lucide-react';

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
    is_read?: boolean;
    is_saved?: boolean;
}

interface StoryCardProps {
    story: Story;
    index?: number;
    onSelect?: (id: number) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    isSelected?: boolean;
    isRead?: boolean;
}

export function StoryCard({ story, index, onSelect, onToggleSave, isSelected, isRead }: StoryCardProps) {
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

    const displayRank = story.hn_rank || (index !== undefined ? index + 1 : null);
    const dimmed = story.is_read || isRead;
    const saved = story.is_saved || false;

    // Zebra stripe: odd rows get a visible tint
    const isOdd = index !== undefined && index % 2 !== 0;
    const stripeBg = isOdd ? 'bg-slate-800/80' : 'bg-transparent';

    // Active state overrides everything
    const activeBg = isSelected
        ? 'bg-[#1e293b] border-l-4 border-l-orange-500 shadow-lg shadow-black/40 ring-1 ring-white/10'
        : `${stripeBg} hover:bg-white/[0.06] border-l-4 border-l-transparent`;

    return (
        <div className={`group relative rounded-md py-2 px-3 transition-all duration-150 ${activeBg}`}>
            {/* Save/Star button — top right */}
            {onToggleSave && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSave(story.id, !saved); }}
                    className={`absolute top-2 right-2 p-1 rounded-md transition-all duration-150 z-20 ${saved
                        ? 'text-yellow-400 hover:text-yellow-300 hover:scale-110'
                        : 'text-gray-500 dark:text-slate-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400 dark:hover:text-yellow-400 hover:scale-110'
                        }`}
                    title={saved ? 'Unsave' : 'Save'}
                >
                    <Star size={14} fill={saved ? 'currentColor' : 'none'} strokeWidth={saved ? 2 : 1.5} />
                </button>
            )}

            <div className={`relative z-10 ${isSelected ? 'pr-6' : 'pr-8'}`}>
                <h3 className={`text-[14px] ${isSelected ? 'leading-snug mb-1.5 font-semibold whitespace-normal' : 'leading-none mb-0 font-medium truncate'} ${dimmed ? 'text-slate-500' : 'text-slate-200'}`}>
                    {displayRank && (
                        <span className="text-slate-500 font-normal mr-2 select-none tabular-nums text-xs">
                            {displayRank}.
                        </span>
                    )}
                    <a
                        href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-orange-400 transition-colors"
                    >
                        {story.title}
                    </a>
                </h3>

                {isSelected && (
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 font-medium">
                        {domain && (
                            <div className="flex items-center gap-1.5 text-slate-500">
                                <img
                                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                    alt=""
                                    className="w-4 h-4 rounded-sm"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <span className="truncate max-w-[150px] hover:text-slate-300 transition-colors">{domain}</span>
                                <span className="text-slate-600">•</span>
                            </div>
                        )}
                        {!domain && story.title.startsWith('Ask HN') && (
                            <div className="flex items-center gap-1 text-slate-500">
                                <Terminal size={12} />
                                <span>Ask HN</span>
                                <span className="text-slate-600">•</span>
                            </div>
                        )}

                        <span className="flex items-center gap-1 text-orange-500">
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
                            className={`flex items-center gap-1 transition-colors px-2 py-0.5 rounded-full ${story.descendants > 0 ? 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            {story.descendants > 0 ? `${story.descendants}` : 'discuss'}
                        </button>
                    </div>
                )}
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
