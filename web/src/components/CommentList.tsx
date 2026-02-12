

interface Comment {
    id: number;
    story_id: number;
    parent_id: number | null;
    text: string;
    by: string;
    time: string;
}

interface CommentListProps {
    comments: Comment[];
    parentId: number | null;
    depth?: number;
}

export function CommentList({ comments, parentId, depth = 0 }: CommentListProps) {
    // Filter comments that belong to this parent
    const childComments = comments.filter(c => c.parent_id === parentId);

    if (childComments.length === 0) {
        return null;
    }

    return (
        <div className={`flex flex-col gap-3 ${depth > 0 ? 'ml-3 pl-3 border-l border-gray-200 dark:border-slate-700/50' : ''}`}>
            {childComments.map(comment => (
                <div key={comment.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-1 text-xs text-gray-500 dark:text-slate-400">
                        <span className="font-bold text-[#ff6600]">{comment.by}</span>
                        <span>{getTimeAgo(new Date(comment.time))}</span>
                    </div>
                    <div
                        className="text-gray-800 dark:text-slate-300 overflow-hidden break-words prose prose-sm max-w-none leading-snug [&>p]:mb-2 [&>pre]:bg-gray-100 dark:[&>pre]:bg-slate-800 [&>pre]:p-2 [&>pre]:overflow-x-auto [&>a]:text-indigo-600 dark:[&>a]:text-indigo-400 hover:[&>a]:underline"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />

                    {/* Recursive render */}
                    <div className="mt-2">
                        <CommentList comments={comments} parentId={comment.id} depth={depth + 1} />
                    </div>
                </div>
            ))}
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
