
export interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string; // ISO string from backend
    created_at: string;
}

interface StoryCardProps {
    story: Story;
    onSelect?: (id: number) => void;
}

export function StoryCard({ story, onSelect }: StoryCardProps) {
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

    return (
        <div className="mb-2 text-gray-300">
            <div className="inline-block align-top leading-snug">
                <a
                    href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-100 hover:text-[#ff6600] visited:text-gray-400 font-medium mr-2 transition-colors"
                >
                    {story.title}
                </a>
                {domain && (
                    <span className="text-xs text-gray-500">
                        (<a href={`#`} className="hover:text-gray-300 transition-colors">{domain}</a>)
                    </span>
                )}
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1 flex-wrap">
                <span className="text-[#ff6600] font-medium">{story.score} points</span>
                <span>by</span>
                <a href={`https://news.ycombinator.com/user?id=${story.by}`} target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">{story.by}</a>
                <span className="text-gray-600">•</span>
                <span className="hover:text-gray-300 cursor-pointer transition-colors" title={date.toLocaleString()}>{timeAgo}</span>
                <span className="text-gray-600">•</span>
                <button
                    onClick={() => onSelect && onSelect(story.id)}
                    className="hover:text-gray-300 transition-colors flex items-center gap-1 text-gray-500 hover:underline"
                >
                    {story.descendants > 0 ? (
                        <>
                            {/* Comment Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
                            {story.descendants}
                        </>
                    ) : 'discuss'}
                </button>
            </div>
        </div>
    );
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
}
