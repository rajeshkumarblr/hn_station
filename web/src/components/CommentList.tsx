import { useState } from 'react';
import { ChevronUp, ChevronDown, MessageSquare, AlertCircle } from 'lucide-react';
import { getApiBase } from '../utils/apiBase';

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
    onFocusComment?: (id: string) => void;
    refreshComments?: () => void;
}

function countDescendants(comments: Comment[], parentId: number): number {
    const children = comments.filter(c => c.parent_id === parentId);
    let count = children.length;
    for (const child of children) {
        count += countDescendants(comments, child.id);
    }
    return count;
}

function CommentNode({ comment, comments, depth, activeCommentId, onFocusComment, refreshComments }: { comment: Comment; comments: Comment[]; depth: number; activeCommentId?: string | null; onFocusComment?: (id: string) => void; refreshComments?: () => void }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const descendantCount = countDescendants(comments, comment.id);
    const isActive = activeCommentId === comment.id.toString();

    const [voted, setVoted] = useState<'up' | 'down' | null>(null);
    const [voting, setVoting] = useState(false);
    const [voteError, setVoteError] = useState<string | null>(null);

    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [replying, setReplying] = useState(false);
    const [replyError, setReplyError] = useState<string | null>(null);

    const handleUpvote = (e: React.MouseEvent) => handleVoteAction(e, 'up');
    const handleDownvote = (e: React.MouseEvent) => handleVoteAction(e, 'down');

    const handleVoteAction = async (e: React.MouseEvent, direction: 'up' | 'down') => {
        e.stopPropagation();
        if (voting) return;

        const hnUsername = localStorage.getItem('hn_username');
        const hnPassword = localStorage.getItem('hn_password');

        if (!hnUsername || !hnPassword) {
            setVoteError("Set login in settings");
            setTimeout(() => setVoteError(null), 3000);
            return;
        }

        setVoting(true);
        setVoteError(null);

        try {
            const res = await fetch(`${getApiBase()}/api/hn/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: hnUsername,
                    password: hnPassword,
                    action: 'vote',
                    item_id: comment.id,
                    how: direction
                })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `Failed to ${direction}vote`);
            }

            setVoted(direction);
        } catch (err: any) {
            setVoteError(err.message || 'Error voting');
            setTimeout(() => setVoteError(null), 3000);
        } finally {
            setVoting(false);
        }
    };

    const handleReplySubmit = async () => {
        if (!replyText.trim() || replying) return;

        const hnUsername = localStorage.getItem('hn_username');
        const hnPassword = localStorage.getItem('hn_password');

        if (!hnUsername || !hnPassword) {
            setReplyError("Please set HN login in settings");
            return;
        }

        setReplying(true);
        setReplyError(null);

        try {
            const res = await fetch(`${getApiBase()}/api/hn/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: hnUsername,
                    password: hnPassword,
                    action: 'comment',
                    item_id: comment.id,
                    text: replyText
                })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to submit reply');
            }

            setIsReplying(false);
            setReplyText('');
            if (refreshComments) {
                refreshComments();
            }
        } catch (err: any) {
            setReplyError(err.message || 'Error submitting reply');
        } finally {
            setReplying(false);
        }
    };

    return (
        <div
            className={`text-sm group/comment relative transition-colors duration-150 ${isActive ? '-mx-3 px-3 border-l-2 border-amber-500/80 bg-amber-500/5 rounded-r-lg' : 'border-l-2 border-transparent'}`}
            {...(depth === 0 ? { 'data-root-comment': 'true' } : {})}
        >
            {/* Content Wrapper - Target for highlight and navigation */}
            <div
                className="comment-node group/node transition-colors duration-150 rounded-lg py-1.5 px-1.5 -ml-1.5 hover:bg-slate-100/70 dark:hover:bg-slate-800/35"
                data-comment-id={comment.id}
                onClick={(e) => {
                    e.stopPropagation();
                    onFocusComment?.(comment.id.toString());
                }}
            >
                {/* Header row — author, time, and subtle hover-only actions */}
                <div className="flex items-center justify-between gap-2 mb-1.5 text-xs text-slate-500 dark:text-slate-400 select-none">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsCollapsed(!isCollapsed);
                            }}
                            className="hover:bg-slate-200/70 dark:hover:bg-slate-700/50 rounded px-1 py-0.5 -ml-1 transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none"
                            aria-expanded={!isCollapsed}
                            title={isCollapsed ? 'Expand thread' : 'Collapse thread'}
                        >
                            <ChevronDown size={12} className={`text-slate-400 dark:text-slate-500 transition-transform duration-150 shrink-0 ${isCollapsed ? '-rotate-90 text-amber-500' : ''}`} />
                            <span className={`font-semibold ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-orange-600 dark:text-orange-400/90'}`}>{comment.by}</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{getTimeAgo(new Date(comment.time))}</span>
                        </button>

                        {isCollapsed && descendantCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded text-slate-500 dark:text-slate-400 font-semibold">
                                +{descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
                            </span>
                        )}
                    </div>

                    {/* Subtle inline actions — hidden until hover (or active vote/reply) */}
                    {!isCollapsed && (
                        <div className={`flex items-center gap-2.5 text-[11px] font-medium transition-opacity duration-150 ${voted || isReplying || voteError ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'}`}>
                            <button
                                onClick={handleUpvote}
                                disabled={voting}
                                title="Upvote comment"
                                className={`flex items-center gap-0.5 transition-colors cursor-pointer ${voted === 'up' ? 'text-orange-500 font-bold' : 'text-slate-400 hover:text-orange-500'}`}
                            >
                                <ChevronUp size={13} />
                                <span>Up</span>
                            </button>

                            <button
                                onClick={handleDownvote}
                                disabled={voting}
                                title="Downvote comment"
                                className={`flex items-center gap-0.5 transition-colors cursor-pointer ${voted === 'down' ? 'text-blue-500 font-bold' : 'text-slate-400 hover:text-blue-400'}`}
                            >
                                <ChevronDown size={13} />
                                <span>Down</span>
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsReplying(!isReplying);
                                }}
                                title="Reply to comment"
                                className={`flex items-center gap-1 transition-colors cursor-pointer ${isReplying ? 'text-indigo-500 font-bold' : 'text-slate-400 hover:text-indigo-400'}`}
                            >
                                <MessageSquare size={11} />
                                <span>Reply</span>
                            </button>

                            {voteError && (
                                <span className="flex items-center gap-1 text-red-500 text-[10px]">
                                    <AlertCircle size={10} className="shrink-0" />
                                    {voteError}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <div
                        className="font-reading text-[14.5px] text-slate-800 dark:text-slate-200/95 overflow-hidden break-words prose prose-slate dark:prose-invert max-w-none leading-[1.65] [&>p]:mb-2.5 [&>p:last-child]:mb-0 [&>pre]:bg-slate-100 dark:[&>pre]:bg-slate-800/80 [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>a]:text-sky-600 dark:[&>a]:text-sky-400 hover:[&>a]:underline ml-4"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />
                )}

                {!isCollapsed && isReplying && (
                    <div className="mt-2.5 ml-4 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/70 dark:border-slate-700/60 flex flex-col gap-2 cursor-default" onClick={e => e.stopPropagation()}>
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            rows={3}
                            autoFocus
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                        />
                        {replyError && (
                            <div className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                <AlertCircle size={12} />
                                {replyError}
                            </div>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => {
                                    setIsReplying(false);
                                    setReplyText('');
                                    setReplyError(null);
                                }}
                                className="px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReplySubmit}
                                disabled={replying || !replyText.trim()}
                                className="px-3 py-1 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                            >
                                {replying ? 'Posting...' : 'Post Reply'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Children Container - Outside the highlight wrapper */}
            {!isCollapsed && (
                <div className="mt-2 relative">
                    <CommentList
                        comments={comments}
                        parentId={comment.id}
                        depth={depth + 1}
                        onCollapse={() => setIsCollapsed(true)}
                        activeCommentId={activeCommentId}
                        onFocusComment={onFocusComment}
                        refreshComments={refreshComments}
                    />
                </div>
            )}
        </div>
    );
}

export function CommentList({ comments, parentId, depth = 0, onCollapse, activeCommentId, onFocusComment, refreshComments }: CommentListProps) {
    const childComments = comments.filter(c => c.parent_id === parentId);

    if (childComments.length === 0) {
        return null;
    }

    const lineColors = [
        'bg-indigo-500/30 dark:bg-indigo-500/20',
        'bg-emerald-500/30 dark:bg-emerald-500/20',
        'bg-amber-500/30 dark:bg-amber-500/20',
        'bg-rose-500/30 dark:bg-rose-500/20',
        'bg-sky-500/30 dark:bg-sky-500/20',
    ];
    const lineColor = lineColors[(depth - 1) % lineColors.length];

    return (
        <div className={`flex flex-col gap-3 relative ${depth > 0 ? (depth >= 5 ? 'pl-2.5' : 'pl-4') : 'divide-y divide-slate-200/60 dark:divide-slate-800/70 [&>*:not(:first-child)]:pt-3'}`}>
            {/* Thread Line - Only for nested levels */}
            {depth > 0 && (
                <div
                    className={`absolute left-0 top-0 bottom-0 w-px ${lineColor} hover:w-[2px] hover:bg-orange-400 dark:hover:bg-orange-500/80 cursor-pointer transition-all z-10 group/line`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onCollapse?.();
                    }}
                    title="Collapse thread"
                >
                    <div className="absolute inset-y-0 -left-2 -right-2 bg-transparent" />
                </div>
            )}

            {childComments.map(comment => (
                <CommentNode
                    key={comment.id}
                    comment={comment}
                    comments={comments}
                    depth={depth}
                    activeCommentId={activeCommentId}
                    onFocusComment={onFocusComment}
                    refreshComments={refreshComments}
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
