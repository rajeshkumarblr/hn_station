import { useState, useRef } from 'react';
import { MessageSquare, RefreshCw, ExternalLink, Sparkles, X } from 'lucide-react';
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
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList }: ReaderPaneProps) {
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handleCollapse = (commentId: string) => {
        // finding the button via DOM is the most reliable way without complex state lifting
        const node = containerRef.current?.querySelector(`[data-comment-id="${commentId}"]`);
        const btn = node?.querySelector('button');
        if (btn) (btn as HTMLButtonElement).click();
    };

    const handleSummarize = async () => {
        if (isSummarizing || summary) return;
        setIsSummarizing(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/stories/${story.id}/summarize`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Failed to summarize');
            const data = await res.json();
            setSummary(data.summary);
        } catch (e) {
            console.error(e);
            alert('Failed to generate summary');
        } finally {
            setIsSummarizing(false);
        }
    };

    const { activeCommentId } = useKeyboardNav(
        containerRef,
        commentsLoading,
        handleCollapse,
        handleSummarize,
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
                        onClick={handleSummarize}
                        disabled={isSummarizing || !!summary}
                        className={`flex items-center gap-1.5 text-xs font-bold transition-all px-2 py-1 rounded border ${summary
                            ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                            : 'bg-slate-800/50 text-slate-400 hover:text-purple-400 hover:bg-slate-800 border-transparent hover:border-slate-700'
                            }`}
                        title="Summarize discussion with AI (Shortcut: s)"
                    >
                        {isSummarizing ? (
                            <RefreshCw size={12} className="animate-spin" />
                        ) : (
                            <Sparkles size={12} />
                        )}
                        <span>{isSummarizing ? 'Thinking...' : 'Summarize'}</span>
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

            {/* Summary Overlay */}
            {summary && (
                <div className="px-6 py-4 bg-purple-900/10 border-b border-purple-500/20 relative animate-in fade-in slide-in-from-top-2">
                    <button
                        onClick={() => setSummary(null)}
                        className="absolute top-2 right-2 text-purple-400/50 hover:text-purple-400 transition-colors"
                        title="Close summary"
                    >
                        <X size={16} />
                    </button>
                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Sparkles size={12} />
                        AI Summary
                    </h3>
                    <div className="text-sm text-slate-300 leading-relaxed font-reading prose prose-sm prose-invert max-w-none">
                        <ul className="list-disc list-outside ml-4 space-y-1">
                            {summary.split('\n').map((line, i) => {
                                const cleanLine = line.replace(/^[-•*]\s*/, '').trim();
                                if (!cleanLine) return null;
                                return <li key={i}>{cleanLine}</li>;
                            })}
                        </ul>
                    </div>
                </div>
            )}

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
