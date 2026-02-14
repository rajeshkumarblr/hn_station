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
    onCollapse?: () => void;
    activeCommentId?: string | null;
}

function countDescendants(comments: Comment[], parentId: number): number {
    const children = comments.filter(c => c.parent_id === parentId);
    let count = children.length;
    for (const child of children) {
        count += countDescendants(comments, child.id);
    }
    return count;
}

function CommentNode({ comment, comments, depth, activeCommentId }: { comment: Comment; comments: Comment[]; depth: number; activeCommentId?: string | null }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const descendantCount = countDescendants(comments, comment.id);
    const isActive = activeCommentId === comment.id.toString();

    return (
        <div
            className={`text-sm group/comment relative comment-node transition-all duration-200 ${isActive ? 'bg-blue-900/10 -mx-3 px-3 rounded-r-md border-l-[3px] border-blue-500' : 'border-l-[3px] border-transparent'}`}
            {...(depth === 0 ? { 'data-root-comment': 'true' } : {})}
            data-comment-id={comment.id}
        >
            {/* Header row — click to toggle */}
            <div className="flex items-center gap-2 mb-1 text-xs text-slate-400 select-none">
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className={`hover:bg-slate-800 rounded px-1 -ml-1 transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none ${isActive ? 'text-blue-200' : ''}`}
                    aria-expanded={!isCollapsed}
                >
                    <span className="text-slate-500 font-mono w-3 text-center shrink-0">
                        {isCollapsed ? '+' : '−'}
                    </span>
                    <span className={`font-bold ${isActive ? 'text-blue-400' : 'text-[#ff6600]'}`}>{comment.by}</span>
                    <span>{getTimeAgo(new Date(comment.time))}</span>
                </button>

                {isCollapsed && descendantCount > 0 && (
                    <span className="text-slate-500">
                        ({descendantCount} {descendantCount === 1 ? 'child' : 'children'})
                    </span>
                )}
            </div>

            {/* Body + children */}
            {!isCollapsed && (
                <div className="relative">
                    {/* Content */}
                    <div
                        className="font-reading text-slate-300 overflow-hidden break-words prose prose-sm prose-invert max-w-none leading-relaxed [&>p]:mb-2 [&>pre]:bg-slate-800 [&>pre]:p-2 [&>pre]:overflow-x-auto [&>a]:text-indigo-400 hover:[&>a]:underline ml-5"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />

                    {/* Children Container */}
                    <div className="mt-3">
                        <CommentList
                            comments={comments}
                            parentId={comment.id}
                            depth={depth + 1}
                            onCollapse={() => setIsCollapsed(true)}
                            activeCommentId={activeCommentId}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export function CommentList({ comments, parentId, depth = 0, onCollapse, activeCommentId }: CommentListProps) {
    const childComments = comments.filter(c => c.parent_id === parentId);

    if (childComments.length === 0) {
        return null;
    }

    return (
        <div className={`flex flex-col gap-4 relative ${depth > 0 ? 'pl-4' : ''}`}>
            {/* Thread Line - Only for nested levels */}
            {depth > 0 && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-slate-800 hover:bg-orange-500 cursor-pointer transition-colors z-10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onCollapse?.();
                    }}
                    title="Collapse thread"
                />
            )}

            {childComments.map(comment => (
                <CommentNode
                    key={comment.id}
                    comment={comment}
                    comments={comments}
                    depth={depth}
                    activeCommentId={activeCommentId}
                />
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
