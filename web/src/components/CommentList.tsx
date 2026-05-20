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
            className={`text-sm group/comment relative transition-all duration-200 ${isActive ? '-mx-3 px-3 border-l-[3px] border-blue-500' : 'border-l-[3px] border-transparent'}`}
            {...(depth === 0 ? { 'data-root-comment': 'true' } : {})}
        >
            {/* Content Wrapper - Target for highlight and navigation */}
            <div
                className={`comment-node transition-all duration-200 cursor-pointer ${isActive ? 'bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-500/20 shadow-sm py-2 px-3 -ml-3 my-1' : 'border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/30 rounded-lg py-1 px-1 -ml-1'}`}
                data-comment-id={comment.id}
                onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering parent's click
                    onFocusComment?.(comment.id.toString());
                }}
            >
                {/* Header row — click to toggle */}
                <div className="flex items-center gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400 select-none">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsCollapsed(!isCollapsed);
                        }}
                        className={`hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded px-1.5 py-0.5 -ml-1 transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none ${isActive ? 'text-blue-600 dark:text-blue-300' : ''}`}
                        aria-expanded={!isCollapsed}
                    >
                        <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded-sm border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center shrink-0">
                            {isCollapsed ? '[+]' : '[-]'}
                        </span>
                        <span className={`font-bold ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-[#ff6600]'}`}>{comment.by}</span>
                        <span>{getTimeAgo(new Date(comment.time))}</span>
                    </button>

                    {isCollapsed && descendantCount > 0 && (
                        <span className="text-slate-400 dark:text-slate-500">
                            ({descendantCount} {descendantCount === 1 ? 'child' : 'children'})
                        </span>
                    )}
                </div>

                {/* Body */}
                {!isCollapsed && (
                    <div
                        className="font-reading text-slate-800 dark:text-slate-300 overflow-hidden break-words prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>p]:mb-2 [&>pre]:bg-slate-100 dark:[&>pre]:bg-slate-800 [&>pre]:p-2 [&>pre]:overflow-x-auto [&>a]:text-blue-600 dark:[&>a]:text-indigo-400 hover:[&>a]:underline ml-5"
                        dangerouslySetInnerHTML={{ __html: comment.text }}
                    />
                )}

                {/* Actions Toolbar - Only shown if not collapsed */}
                {!isCollapsed && (
                    <div className="flex items-center gap-3 mt-1.5 ml-5 text-[10px] font-bold text-slate-400 select-none">
                        {/* Upvote Button */}
                        <button
                            onClick={handleUpvote}
                            disabled={voting}
                            title="Upvote comment"
                            className={`flex items-center gap-0.5 hover:text-orange-500 transition-colors p-0.5 rounded ${voted === 'up' ? 'text-orange-500 font-black' : ''}`}
                        >
                            <ChevronUp size={12} />
                            <span>Upvote</span>
                        </button>

                        {/* Downvote Button */}
                        <button
                            onClick={handleDownvote}
                            disabled={voting}
                            title="Downvote comment"
                            className={`flex items-center gap-0.5 hover:text-blue-500 transition-colors p-0.5 rounded ${voted === 'down' ? 'text-blue-500 font-black' : ''}`}
                        >
                            <ChevronDown size={12} />
                            <span>Downvote</span>
                        </button>

                        {/* Reply Button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsReplying(!isReplying);
                            }}
                            className={`flex items-center gap-1 hover:text-indigo-500 transition-colors p-0.5 rounded ${isReplying ? 'text-indigo-500 font-black' : ''}`}
                        >
                            <MessageSquare size={10} />
                            <span>Reply</span>
                        </button>

                        {/* Error Message */}
                        {voteError && (
                            <span className="flex items-center gap-0.5 text-red-500 animate-pulse text-[9px]">
                                <AlertCircle size={10} />
                                {voteError}
                            </span>
                        )}
                    </div>
                )}

                {/* Reply Form */}
                {!isCollapsed && isReplying && (
                    <div className="mt-2.5 ml-5 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-slate-800/40 flex flex-col gap-2 cursor-default" onClick={e => e.stopPropagation()}>
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type your reply here..."
                            rows={3}
                            className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
                        />
                        {replyError && (
                            <div className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                                <AlertCircle size={12} />
                                {replyError}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={handleReplySubmit}
                                disabled={replying || !replyText.trim()}
                                className="px-3 py-1.5 text-[10px] font-black text-white bg-[#ff6600] hover:bg-[#e65c00] rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                            >
                                {replying ? 'Submitting...' : 'SUBMIT REPLY'}
                            </button>
                            <button
                                onClick={() => {
                                    setIsReplying(false);
                                    setReplyText('');
                                    setReplyError(null);
                                }}
                                className="px-3 py-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-200/50 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/60 rounded-lg transition-colors"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Children Container - Outside the highlight wrapper */}
            {!isCollapsed && (
                <div className="mt-3 relative">
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
        <div className={`flex flex-col gap-4 relative ${depth > 0 ? 'pl-4' : ''}`}>
            {/* Thread Line - Only for nested levels */}
            {depth > 0 && (
                <div
                    className="absolute left-0 top-0 bottom-0 w-[2px] bg-slate-200 dark:bg-slate-800/60 hover:bg-orange-400 dark:hover:bg-orange-500/80 cursor-pointer transition-all z-10 group/line"
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
