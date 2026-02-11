
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
}

export function StoryCard({ story }: StoryCardProps) {
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
        <li className="mb-1 text-[14px] marker:text-gray-500 marker:font-mono">
            <div className="inline-block align-top leading-tight">
                <a
                    href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-black visited:text-[#828282] hover:underline mr-1"
                >
                    {story.title}
                </a>
                {domain && (
                    <span className="text-[10px] text-[#828282]">
                        (<a href={`#`} className="hover:underline">{domain}</a>)
                    </span>
                )}
            </div>
            <div className="text-[10px] text-[#828282] leading-tight ml-0">
                {story.score} points by <a href={`https://news.ycombinator.com/user?id=${story.by}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{story.by}</a> <span className="hover:underline cursor-pointer" title={date.toLocaleString()}>{timeAgo}</span> | <a href="#" className="hover:underline">hide</a> | <a href="#" className="hover:underline">past</a> | <a href={`https://news.ycombinator.com/item?id=${story.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{story.descendants > 0 ? `${story.descendants} comments` : 'discuss'}</a>
            </div>
        </li>
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
