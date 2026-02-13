import { useState } from 'react';

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

function countDescendants(comments: Comment[], parentId: number): number {
    const children = comments.filter(c => c.parent_id === parentId);
    let count = children.length;
    for (const child of children) {
        count += countDescendants(comments, child.id);
    }
    return count;
}

function CommentNode({ comment, comments, depth }: { comment: Comment; comments: Comment[]; depth: number }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const descendantCount = countDescendants(comments, comment.id);

    return (
        <div className="text-sm">
            {/* Header row — fully clickable to toggle collapse */}
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center gap-2 mb-1 text-xs text-slate-400 cursor-pointer hover:bg-slate-800/50 rounded px-1.5 py-1 -mx-1.5 transition-colors select-none"
            >
                <span className="text-slate-500 font-mono w-4 text-center shrink-0">
                    {isCollapsed ? '+' : '−'}
                </span>
                <span className="font-bold text-[#ff6600]">{comment.by}</span>
                <span>{getTimeAgo(new Date(comment.time))}</span>
                {isCollapsed && descendantCount > 0 && (
                    <span className="text-slate-500 ml-1">
                        ({descendantCount} {descendantCount === 1 ? 'child' : 'children'})
                    </span>
                )}
            </div>

            {/* Body + children — hidden when collapsed */}
            {!isCollapsed && (
                <>
                    <div
                        className="text-slate-300 overflow-hidden break-words prose prose-sm prose-invert max-w-none leading-snug [&>p]:mb-2 [&>pre]:bg-slate-800 [&>pre]:p-2 [&>pre]:overflow-x-auto [&>a]:text-indigo-400 hover:[&>a]:underline ml-6"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />
                    <div className="mt-2">
                        <CommentList comments={comments} parentId={comment.id} depth={depth + 1} />
                    </div>
                </>
            )}
        </div>
    );
}

export function CommentList({ comments, parentId, depth = 0 }: CommentListProps) {
    const childComments = comments.filter(c => c.parent_id === parentId);

    if (childComments.length === 0) {
        return null;
    }

    return (
        <div className={`flex flex-col gap-3 ${depth > 0 ? 'ml-4 pl-3 border-l border-slate-700/50' : ''}`}>
            {childComments.map(comment => (
                <CommentNode key={comment.id} comment={comment} comments={comments} depth={depth} />
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
