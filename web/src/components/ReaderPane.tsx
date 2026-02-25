import { useRef, useEffect, useState } from 'react';
import { Check, ArrowLeft, ArrowRight, ExternalLink, Link, MessageSquare, RefreshCw, Trash2, Bookmark } from 'lucide-react';
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
    onSkip?: () => void;
    onSelectStory?: (id: number) => void;
    stories?: Story[];
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, onPrev, onNext, onSkip, onSelectStory, stories = [] }: ReaderPaneProps) {
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

    // Helper to truncate text
    const truncate = (text: string, length: number) => {
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    };

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
            <div className="flex items-center justify-between px-6 py-2 bg-white dark:bg-[#152238] border-b border-slate-200 dark:border-white/5 shadow-sm shrink-0 z-20">
                <div className="flex flex-col gap-1 mr-4 flex-1 min-w-0">
                    <h2 className={`font-bold text-sm ${titleColor}`} title={story.title}>
                        {story.title}
                    </h2>

                    {/* Tab Switcher */}
                    <div className="flex items-center gap-4">
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
                </div>

                {/* Center: Navigation Buttons & Dropdown */}
                <div className="flex items-center justify-center shrink-0 mx-4">
                    <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1.5 border border-slate-200 dark:border-slate-700 shadow-sm">

                        {/* Prev 10 articles dropdown */}
                        {stories && stories.length > 0 && onSelectStory && (
                            <select
                                className="mr-1 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md py-1 px-2 text-slate-700 dark:text-slate-300 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate cursor-pointer outline-none"
                                value={story.id}
                                onChange={(e) => onSelectStory(Number(e.target.value))}
                                title="Jump to previous article"
                            >
                                <option value={story.id} disabled className="italic">
                                    {prevStory ? truncate(prevStory.title, 30) : "No prev articles"}
                                </option>
                                {stories
                                    .slice(Math.max(0, currentIndex - 10), Math.max(0, currentIndex))
                                    .map(s => (
                                        <option key={s.id} value={s.id} title={s.title}>
                                            {s.title}
                                        </option>
                                    ))}
                            </select>
                        )}

                        <button
                            onClick={onPrev}
                            disabled={!onPrev}
                            className={`p-1.5 rounded transition-colors ${!onPrev ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm'}`}
                            title="prev article"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <button
                            onClick={onSkip}
                            disabled={!onSkip}
                            className={`p-1.5 rounded transition-colors ${!onSkip ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-red-500 dark:hover:text-red-400 shadow-sm'}`}
                            title="Skip article"
                        >
                            <Trash2 size={16} />
                        </button>
                        <button
                            onClick={onNext}
                            disabled={!onNext}
                            className={`p-1.5 rounded transition-colors ${!onNext ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-blue-600 dark:hover:text-blue-400 shadow-sm'}`}
                            title="next article)"
                        >
                            <ArrowRight size={18} />
                        </button>

                        {/* Next 10 articles dropdown */}
                        {stories && stories.length > 0 && onSelectStory && (
                            <select
                                className="ml-1 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md py-1 px-2 text-slate-700 dark:text-slate-300 w-48 focus:outline-none focus:ring-1 focus:ring-blue-500 truncate cursor-pointer outline-none"
                                value={story.id}
                                onChange={(e) => onSelectStory(Number(e.target.value))}
                                title="Jump to next article"
                            >
                                <option value={story.id} disabled className="italic">
                                    {nextStory ? truncate(nextStory.title, 30) : "No next articles"}
                                </option>
                                {stories
                                    .slice(Math.max(0, currentIndex + 1), currentIndex + 11)
                                    .map(s => (
                                        <option key={s.id} value={s.id} title={s.title}>
                                            {s.title}
                                        </option>
                                    ))}
                            </select>
                        )}
                    </div>
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
