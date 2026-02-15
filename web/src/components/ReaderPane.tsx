import { useRef } from 'react';
import { MessageSquare, ExternalLink, Sparkles, RefreshCw } from 'lucide-react';
import { CommentList } from './CommentList';
import { useKeyboardNav } from '../hooks/useKeyboardNav';

interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string;
}

interface ReaderPaneProps {
    story: Story;
    comments: any[];
    commentsLoading: boolean;
    onFocusList?: () => void;
    onSummarize?: () => void;
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize }: ReaderPaneProps) {
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const containerRef = useRef<HTMLDivElement>(null);

    const handleCollapse = (commentId: string) => {
        // finding the button via DOM is the most reliable way without complex state lifting
        const node = containerRef.current?.querySelector(`[data-comment-id="${commentId}"]`);
        const btn = node?.querySelector('button');
        if (btn) (btn as HTMLButtonElement).click();
    };

    const { activeCommentId } = useKeyboardNav(
        containerRef,
        commentsLoading,
        handleCollapse,
        onSummarize || (() => { }),
        onFocusList
    );

    return (
        <div className="relative h-full flex flex-col bg-[#111d2e] border-t border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* Compact Sticky Title Bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-[#0d1624] border-b border-white/5 shadow-sm shrink-0 z-20">
                <h2 className="text-slate-200 font-bold text-sm truncate mr-4" title={story.title}>
                    {story.title}
                </h2>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onSummarize}
                        className="flex items-center gap-1.5 text-xs font-bold transition-all px-2 py-1 rounded border bg-slate-800/50 text-slate-400 hover:text-purple-400 hover:bg-slate-800 border-transparent hover:border-slate-700"
                        title="Open AI Assistant (Shortcut: s)"
                    >
                        <Sparkles size={12} />
                        <span>AI Assistant</span>
                    </button>

                    <a
                        href={storyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-orange-400 transition-colors px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-800 border border-transparent hover:border-slate-700"
                        title="Open Article"
                    >
                        <span>Read</span>
                        <ExternalLink size={12} />
                    </a>
                </div>
            </div>



            {/* Scrollable Comment Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div
                    ref={containerRef}
                    className="max-w-5xl relative cursor-text select-text pointer-events-auto"
                >
                    {commentsLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                            <RefreshCw size={24} className="animate-spin text-blue-500" />
                            <span className="animate-pulse font-medium">Loading discussion...</span>
                        </div>
                    ) : comments.length > 0 ? (
                        <div className="pb-20">
                            <CommentList
                                comments={comments}
                                parentId={null}
                                activeCommentId={activeCommentId}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-32 text-center opacity-60">
                            <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
                                <MessageSquare size={32} className="text-slate-500" />
                            </div>
                            <p className="text-slate-400 font-medium text-lg">No comments yet.</p>
                            <p className="text-slate-500 text-sm mt-1">Be the first to share your thoughts on the original post.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
