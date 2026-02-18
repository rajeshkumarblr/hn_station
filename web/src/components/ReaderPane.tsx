import { useRef, useEffect, useState } from 'react';
import { MessageSquare, ExternalLink, Sparkles, RefreshCw } from 'lucide-react';
import { CommentList } from './CommentList';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { getStoryColor } from '../utils/colors';
import DOMPurify from 'dompurify';

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
    onTakeFocus?: () => void;
    initialActiveCommentId?: string | null;
    onSaveProgress?: (commentId: string) => void;
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress }: ReaderPaneProps) {
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'discussion' | 'article'>('discussion');
    const [articleContent, setArticleContent] = useState<string | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState<string | null>(null);
    const [useIframe, setUseIframe] = useState(false);
    const [canIframe, setCanIframe] = useState(true);

    const handleCollapse = (commentId: string) => {
        // finding the button via DOM is the most reliable way without complex state lifting
        const node = containerRef.current?.querySelector(`[data-comment-id="${commentId}"]`);
        const btn = node?.querySelector('button');
        if (btn) (btn as HTMLButtonElement).click();
    };

    const { activeCommentId, setActiveCommentId } = useKeyboardNav(
        containerRef,
        commentsLoading,
        handleCollapse,
        onSummarize || (() => { }),
        onFocusList,
        initialActiveCommentId
    );

    // Sync progress
    useEffect(() => {
        if (activeCommentId) {
            onSaveProgress?.(activeCommentId);
        }
    }, [activeCommentId, onSaveProgress]);

    // Fetch article content on tab switch
    useEffect(() => {
        if (activeTab === 'article' && !articleContent && !articleLoading) {
            setArticleLoading(true);
            setArticleError(null);
            const baseUrl = import.meta.env.VITE_API_URL || '';
            fetch(`${baseUrl}/api/stories/${story.id}/content`)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to load article content');
                    return res.json();
                })
                .then(data => {
                    setArticleContent(data.content);
                    // If backend says we can iframe, default to iframe (web view)
                    // Otherwise default to Reader View (legacy text)
                    setUseIframe(data.can_iframe);
                    setCanIframe(data.can_iframe);
                    setArticleLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setArticleError('Could not load article content. It might be behind a paywall or inaccessible.');
                    setArticleLoading(false);
                });
        }
    }, [activeTab, story.id, articleContent, articleLoading]);

    const titleColor = getStoryColor(story.id);

    return (
        <div className="relative h-full flex flex-col bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* Compact Sticky Title Bar */}
            <div className="flex items-center justify-between px-6 py-2 bg-white dark:bg-[#152238] border-b border-slate-200 dark:border-white/5 shadow-sm shrink-0 z-20">
                <div className="flex flex-col gap-1 mr-4 flex-1 min-w-0">
                    <h2 className={`font-bold text-sm truncate ${titleColor}`} title={story.title}>
                        {story.title}
                    </h2>

                    {/* Tab Switcher */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setActiveTab('discussion')}
                            className={`text-xs font-semibold pb-0.5 border-b-2 transition-colors ${activeTab === 'discussion'
                                ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Discussion
                        </button>
                        <button
                            onClick={() => setActiveTab('article')}
                            className={`text-xs font-semibold pb-0.5 border-b-2 transition-colors ${activeTab === 'article'
                                ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Article
                        </button>
                        <a
                            href={storyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Open in new tab"
                        >
                            <ExternalLink size={12} />
                        </a>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Mode Toggle (only visible in Article tab) */}
                    {activeTab === 'article' && !articleLoading && !articleError && (
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg mr-2">
                            <button
                                onClick={() => setUseIframe(false)}
                                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${!useIframe
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                title="Reader View (Text)"
                            >
                                Reader
                            </button>
                            <button
                                onClick={() => setUseIframe(true)}
                                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${useIframe
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                    }`}
                                title="Web View (Original)"
                            >
                                Web
                            </button>
                        </div>
                    )}

                    <button
                        onClick={onSummarize}
                        className="flex items-center gap-1.5 text-xs font-bold transition-all px-2 py-1 rounded border bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-200 dark:hover:bg-slate-800 border-slate-200 dark:border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                        title="Open AI Assistant (Shortcut: s)"
                    >
                        <Sparkles size={12} />
                        <span>AI Assistant</span>
                    </button>
                </div>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-3">
                {activeTab === 'discussion' ? (
                    <div
                        ref={containerRef}
                        className="max-w-5xl relative cursor-text select-text pointer-events-auto"
                    >
                        {commentsLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                                <RefreshCw size={24} className="animate-spin text-blue-500" />
                                <span className="animate-pulse font-medium">Loading discussion...</span>
                            </div>
                        ) : comments && comments.length > 0 ? (
                            <div className="pb-20">
                                <CommentList
                                    comments={comments}
                                    parentId={null}
                                    activeCommentId={activeCommentId}
                                    onFocusComment={(id) => {
                                        setActiveCommentId(id);
                                        onTakeFocus?.();
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-32 text-center opacity-60">
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
                                    <MessageSquare size={32} className="text-slate-400 dark:text-slate-500" />
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">No comments yet.</p>
                                <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Be the first to share your thoughts on the original post.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    // Article Tab Content
                    <div className="h-full flex flex-col">
                        {articleLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                                <RefreshCw size={24} className="animate-spin text-teal-500" />
                                <span className="animate-pulse font-medium">Fetching article...</span>
                            </div>
                        ) : articleError ? (
                            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm text-center">
                                {articleError}
                                <div className="mt-2">
                                    <a href={storyUrl} target="_blank" rel="noreferrer" className="underline font-bold">Open in new tab</a>
                                </div>
                            </div>
                        ) : useIframe ? (
                            // Web View (Iframe)
                            <div className="w-full h-full bg-white rounded-lg border border-slate-200 dark:border-slate-700/50 overflow-hidden">
                                {!canIframe && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-4 py-2 text-xs text-center border-b border-amber-100 dark:border-amber-900/50">
                                        Note: This site might block embedding. Switch to <b>Reader View</b> if it doesn't load.
                                    </div>
                                )}
                                <iframe
                                    src={storyUrl}
                                    className="w-full h-full border-0"
                                    sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                                    title="Article Web View"
                                />
                            </div>
                        ) : (
                            // Reader View (Sanitized HTML)
                            <div className="max-w-3xl mx-auto py-4">
                                <article
                                    className="prose prose-sm md:prose-base dark:prose-invert prose-slate max-w-none"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(articleContent || '') }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

        </div>
    );
}
