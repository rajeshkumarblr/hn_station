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
            className={`text-sm group/comment relative transition-colors duration-100 ${isActive ? '-mx-3 px-3 border-l-2 border-[#e06834] bg-stone-200/40 dark:bg-white/[0.04] rounded-r-md' : 'border-l-2 border-transparent'}`}
            {...(depth === 0 ? { 'data-root-comment': 'true' } : {})}
        >
            {/* Content Wrapper - Target for highlight and navigation */}
            <div
                className="comment-node group/node transition-colors duration-100 rounded-md py-1.5 px-1.5 -ml-1.5 hover:bg-stone-100/80 dark:hover:bg-white/[0.025]"
                data-comment-id={comment.id}
                onClick={(e) => {
                    e.stopPropagation();
                    onFocusComment?.(comment.id.toString());
                }}
            >
                {/* Header row — author, time, and subtle hover-only actions */}
                <div className="flex items-center justify-between gap-2 mb-1.5 text-[12px] text-stone-400 dark:text-zinc-500 select-none">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsCollapsed(!isCollapsed);
                            }}
                            className="hover:bg-stone-200/70 dark:hover:bg-white/[0.07] rounded px-1 py-0.5 -ml-1 transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none"
                            aria-expanded={!isCollapsed}
                            title={isCollapsed ? 'Expand thread' : 'Collapse thread'}
                        >
                            <ChevronDown size={12} className={`text-stone-400 dark:text-zinc-500 transition-transform duration-150 shrink-0 ${isCollapsed ? '-rotate-90 text-[#e06834]' : ''}`} />
                            <span className={`font-medium ${isActive ? 'text-[#e06834]' : 'text-stone-700 dark:text-zinc-300'}`}>{comment.by}</span>
                            <span className="text-[11px] text-stone-400 dark:text-zinc-500">{getTimeAgo(new Date(comment.time))}</span>
                        </button>

                        {isCollapsed && descendantCount > 0 && (
                            <span className="text-[10.5px] px-1.5 py-0.5 bg-stone-200/70 dark:bg-white/[0.06] rounded text-stone-500 dark:text-zinc-400 font-medium">
                                +{descendantCount} {descendantCount === 1 ? 'reply' : 'replies'}
                            </span>
                        )}
                    </div>

                    {/* Subtle inline actions — hidden until hover (or active vote/reply) */}
                    {!isCollapsed && (
                        <div className={`flex items-center gap-2.5 text-[11px] font-medium transition-opacity duration-100 ${voted || isReplying || voteError ? 'opacity-100' : 'opacity-0 group-hover/node:opacity-100'}`}>
                            <button
                                onClick={handleUpvote}
                                disabled={voting}
                                title="Upvote comment"
                                className={`flex items-center gap-0.5 transition-colors cursor-pointer ${voted === 'up' ? 'text-[#e06834]' : 'text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200'}`}
                            >
                                <ChevronUp size={13} />
                                <span>Up</span>
                            </button>

                            <button
                                onClick={handleDownvote}
                                disabled={voting}
                                title="Downvote comment"
                                className={`flex items-center gap-0.5 transition-colors cursor-pointer ${voted === 'down' ? 'text-stone-900 dark:text-zinc-100' : 'text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200'}`}
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
                                className={`flex items-center gap-1 transition-colors cursor-pointer ${isReplying ? 'text-stone-900 dark:text-zinc-100' : 'text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200'}`}
                            >
                                <MessageSquare size={11} />
                                <span>Reply</span>
                            </button>

                            {voteError && (
                                <span className="flex items-center gap-1 text-red-500 text-[10.5px]">
                                    <AlertCircle size={10} className="shrink-0" />
                                    {voteError}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {!isCollapsed && (
                    <div
                        className="font-sans text-[14px] text-stone-800 dark:text-[#d4d4d8] overflow-hidden break-words prose prose-stone dark:prose-invert max-w-none leading-[1.68] [&>p]:mb-2.5 [&>p:last-child]:mb-0 [&>pre]:bg-stone-200/60 dark:[&>pre]:bg-[#1a1a1e] [&>pre]:p-3 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>a]:text-[#c85624] dark:[&>a]:text-[#eb7c49] hover:[&>a]:underline ml-4"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />
                )}

                {!isCollapsed && isReplying && (
                    <div className="mt-2.5 ml-4 p-3 bg-stone-100/80 dark:bg-[#18181b] rounded-lg border border-stone-200 dark:border-white/[0.08] flex flex-col gap-2 cursor-default" onClick={e => e.stopPropagation()}>
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            rows={3}
                            autoFocus
                            className="w-full text-[13px] p-2.5 rounded-md border border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#121214] text-stone-900 dark:text-zinc-100 focus:border-stone-400 dark:focus:border-zinc-600 outline-none"
                        />
                        {replyError && (
                            <div className="text-[11px] text-red-500 font-medium flex items-center gap-1">
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
                                className="px-3 py-1 text-[12px] font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200 rounded-md transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReplySubmit}
                                disabled={replying || !replyText.trim()}
                                className="px-3 py-1 text-[12px] font-medium text-white bg-stone-900 dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 disabled:opacity-40 rounded-md transition-opacity cursor-pointer"
                            >
                                {replying ? 'Posting…' : 'Post Reply'}
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

    return (
        <div className={`flex flex-col gap-3 relative ${depth > 0 ? (depth >= 5 ? 'pl-2.5' : 'pl-4') : 'divide-y divide-stone-200/75 dark:divide-white/[0.06] [&>*:not(:first-child)]:pt-3'}`}>
            {/* Subtle Monochrome Thread Line */}
            {depth > 0 && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-px bg-stone-300/75 dark:bg-white/[0.09] hover:w-[2px] hover:bg-[#e06834] cursor-pointer transition-all z-10 group/line"
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
