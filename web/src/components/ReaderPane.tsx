import { useRef, useEffect, useState } from 'react';
import { Check, ArrowLeft, ArrowRight, ExternalLink, Link, MessageSquare, RefreshCw, Bookmark, Home } from 'lucide-react';
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
    is_saved?: boolean;
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
    onToggleSave?: (id: number, saved: boolean) => void;
    onPrev?: () => void;
    onNext?: () => void;
    stories?: Story[];
    onBackToFeed?: () => void;
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, onPrev, onNext, stories = [], onBackToFeed }: ReaderPaneProps) {
    const storyUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'discussion' | 'article'>('article');
    const [articleContent, setArticleContent] = useState<string | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState<string | null>(null);
    const [useIframe, setUseIframe] = useState(false);
    const [canIframe, setCanIframe] = useState(true);
    const [isCopied, setIsCopied] = useState(false);

    // Dropdown helpers
    const currentIndex = stories.findIndex(s => s.id === story.id);
    const prevStory = currentIndex > 0 ? stories[currentIndex - 1] : null;
    const nextStory = currentIndex >= 0 && currentIndex < stories.length - 1 ? stories[currentIndex + 1] : null;


    const handleCopyLink = () => {
        navigator.clipboard.writeText(storyUrl);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

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

    // Tab shortcuts & Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl + Right: Switch to Discussion
            if (e.ctrlKey && e.key === 'ArrowRight') {
                setActiveTab('discussion');
            }
            // Ctrl + Left: 
            // If in Discussion -> Switch to Article
            // If in Article -> Focus Story List
            else if (e.ctrlKey && e.key === 'ArrowLeft') {
                if (activeTab === 'discussion') {
                    setActiveTab('article');
                } else {
                    onFocusList?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, onFocusList, storyUrl]);

    // Sync progress
    useEffect(() => {
        if (activeCommentId) {
            onSaveProgress?.(activeCommentId);
        }
    }, [activeCommentId, onSaveProgress]);

    // Reset article state when story changes
    useEffect(() => {
        setArticleContent(null);
        setArticleError(null);
        setArticleLoading(false);
        setUseIframe(false);
    }, [story.id]);

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
            <div className="flex flex-col px-6 py-3 bg-white dark:bg-[#152238] border-b border-slate-200 dark:border-white/5 shadow-sm shrink-0 z-20">

                {/* Top Row: Title and Navigation */}
                <div className="flex items-center relative w-full mb-3 justify-center min-h-[32px]">
                    {/* Left: Home Button */}
                    {onBackToFeed && (
                        <button
                            onClick={onBackToFeed}
                            className="absolute left-0 p-1.5 -ml-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center shrink-0 group gap-1.5"
                            title="Back to Feed (Esc)"
                        >
                            <Home size={18} />
                            <span className="text-sm font-medium hidden sm:inline">Home</span>
                        </button>
                    )}

                    {/* Center: Prev - Title - Next */}
                    <div className="flex items-center justify-center max-w-[70%]">
                        <button
                            onClick={onPrev}
                            disabled={!onPrev}
                            className={`p-1.5 rounded-full transition-colors shrink-0 mr-2 ${!onPrev ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            title={prevStory ? `Previous: ${prevStory.title}` : "Previous article"}
                        >
                            <ArrowLeft size={18} />
                        </button>

                        <a
                            href={storyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`font-bold text-base truncate px-2 hover:underline decoration-2 underline-offset-4 ${titleColor}`}
                            title={`Open "${story.title}" in a new tab`}
                        >
                            {story.title}
                        </a>

                        <button
                            onClick={onNext}
                            disabled={!onNext}
                            className={`p-1.5 rounded-full transition-colors shrink-0 ml-2 ${!onNext ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            title={nextStory ? `Next: ${nextStory.title}` : "Next article"}
                        >
                            <ArrowRight size={18} />
                        </button>
                    </div>
                </div>

                {/* Bottom Row: Controls */}
                <div className="flex items-center justify-between w-full">

                    {/* Left: Tab Switcher */}
                    <div className="flex items-center gap-4 shrink-0 flex-1">
                        <button
                            onClick={() => setActiveTab('article')}
                            className={`text-xs font-semibold pb-0.5 border-b-2 transition-colors ${activeTab === 'article'
                                ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Article
                        </button>
                        <button
                            onClick={() => setActiveTab('discussion')}
                            className={`text-xs font-semibold pb-0.5 border-b-2 transition-colors ${activeTab === 'discussion'
                                ? 'text-blue-600 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'text-slate-500 border-transparent hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            Discussion
                        </button>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center justify-end gap-2 shrink-0 flex-1">
                        <a
                            href={storyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-100 dark:bg-slate-800 rounded-md"
                            title="Open in new tab"
                        >
                            <ExternalLink size={14} />
                        </a>
                        <button
                            onClick={handleCopyLink}
                            className={`p-1 transition-colors bg-slate-100 dark:bg-slate-800 rounded-md mr-1 ${isCopied ? 'text-green-500' : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                            title={isCopied ? 'Copied!' : 'Copy Link'}
                        >
                            {isCopied ? <Check size={14} /> : <Link size={14} />}
                        </button>
                        {onToggleSave && (
                            <button
                                onClick={() => onToggleSave(story.id, !!story.is_saved)}
                                className={`p-1 transition-colors bg-slate-100 dark:bg-slate-800 rounded-md mr-1 ${story.is_saved ? 'text-blue-500' : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                                title={story.is_saved ? 'Unbookmark' : 'Bookmark'}
                            >
                                <Bookmark size={14} fill={story.is_saved ? "currentColor" : "none"} />
                            </button>
                        )}

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
                    </div>
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
