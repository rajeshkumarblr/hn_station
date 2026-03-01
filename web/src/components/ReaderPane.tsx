import { useRef, useEffect, useState } from 'react';
import { Check, ArrowLeft, ArrowRight, ExternalLink, Link, MessageSquare, RefreshCw, Bookmark, Home, Sparkles, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
    summary?: string;
    topics?: string[];
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
    onSelectStory?: (id: number) => void;
    stories?: Story[];
    onBackToFeed?: () => void;
    activeTab?: 'discussion' | 'article';
    onTabChange?: (tab: 'discussion' | 'article') => void;
    onHide?: (id: number) => void;
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, onPrev, onNext, onSelectStory, stories = [], onBackToFeed, activeTab: activeTabProp, onTabChange, onHide }: ReaderPaneProps) {
    // Always use HTTPS to avoid mixed-content errors on the HTTPS site
    const rawUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const storyUrl = rawUrl.replace(/^http:\/\//, 'https://');

    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'discussion' | 'article'>(activeTabProp || 'article');

    // Sync activeTab with prop
    useEffect(() => {
        if (activeTabProp) {
            setActiveTab(activeTabProp);
        }
    }, [activeTabProp]);

    // Internal tab change should notify parent if possible
    const handleTabChange = (tab: 'discussion' | 'article') => {
        setActiveTab(tab);
        onTabChange?.(tab);
    };

    const [articleContent, setArticleContent] = useState<string | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState<string | null>(null);
    const [useIframe, setUseIframe] = useState(true);
    const [canIframe, setCanIframe] = useState(true);
    const [isCopied, setIsCopied] = useState(false);
    const [bookmarkToast, setBookmarkToast] = useState<'saved' | 'removed' | null>(null);
    const [showSummary, setShowSummary] = useState(true);

    // Compute prev/next directly from stories list
    const currentIndex = stories.findIndex(s => s.id === story.id);
    const prevStory = currentIndex > 0 ? stories[currentIndex - 1] : null;
    const nextStory = currentIndex >= 0 && currentIndex < stories.length - 1 ? stories[currentIndex + 1] : null;

    // Navigate using onSelectStory (preferred) or fallback to onPrev/onNext
    const handlePrevClick = () => {
        if (onSelectStory && prevStory) {
            onSelectStory(prevStory.id);
        } else {
            onPrev?.();
        }
    };
    const handleNextClick = () => {
        if (onSelectStory && nextStory) {
            onSelectStory(nextStory.id);
        } else {
            onNext?.();
        }
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

    // Reset article state when story changes \u2014 default to iframe (Web) view
    useEffect(() => {
        setArticleContent(null);
        setArticleError(null);
        setArticleLoading(false);
        setUseIframe(true);  // Start in Web view; API will override if site blocks iframes
    }, [story.id]);

    // Fetch article content on tab switch
    useEffect(() => {
        if (activeTab === 'article' && !articleContent && !articleLoading) {
            const controller = new AbortController();
            setArticleLoading(true);
            setArticleError(null);
            const baseUrl = import.meta.env.VITE_API_URL || '';

            fetch(`${baseUrl}/api/stories/${story.id}/content`, { signal: controller.signal })
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

                    // Smart default: If content is empty and we can't iframe, switch to discussion
                    if (!data.content && !data.can_iframe) {
                        handleTabChange('discussion');
                    }

                    setArticleLoading(false);
                })
                .catch(err => {
                    if (err.name === 'AbortError') return;
                    console.error(err);
                    setArticleError('Could not load article content. It might be behind a paywall or inaccessible.');
                    setArticleLoading(false);
                    // Fallback to discussion on error
                    handleTabChange('discussion');
                });

            return () => controller.abort();
        }
    }, [activeTab, story.id]);

    const titleColor = getStoryColor(story.id);

    return (
        <div className="relative h-full flex flex-col bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* Compact Sticky Title Bar */}
            <div className="flex flex-col px-6 py-2 bg-white dark:bg-[#152238] border-b border-slate-200 dark:border-white/5 shadow-sm shrink-0 z-20">

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
                            onClick={handlePrevClick}
                            disabled={!prevStory && !onPrev}
                            className={`p-1.5 rounded-full transition-colors shrink-0 mr-2 ${(!prevStory && !onPrev) ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200'}`}
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
                            onClick={handleNextClick}
                            disabled={!nextStory && !onNext}
                            className={`p-1.5 rounded-full transition-colors shrink-0 ml-2 ${(!nextStory && !onNext) ? 'opacity-30 cursor-not-allowed text-slate-400' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-slate-200'}`}
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
                            onClick={() => handleTabChange('article')}
                            className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'article'
                                ? 'text-blue-500 border-blue-500 bg-blue-50/50 dark:bg-blue-500/10'
                                : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <Sparkles size={16} />
                            Article
                        </button>
                        <button
                            onClick={() => handleTabChange('discussion')}
                            className={`flex-1 py-3 text-sm font-semibold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'discussion'
                                ? 'text-blue-500 border-blue-500 bg-blue-50/50 dark:bg-blue-500/10'
                                : 'text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <MessageSquare size={16} />
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
                            <div className="relative flex items-center">
                                <button
                                    onClick={() => {
                                        const nextSaved = !story.is_saved;
                                        onToggleSave(story.id, nextSaved);
                                        setBookmarkToast(nextSaved ? 'saved' : 'removed');
                                        setTimeout(() => setBookmarkToast(null), 2000);
                                    }}
                                    className={`p-1 transition-colors bg-slate-100 dark:bg-slate-800 rounded-md mr-1 ${story.is_saved ? 'text-blue-500' : 'text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'}`}
                                    title={story.is_saved ? 'Unbookmark' : 'Bookmark'}
                                >
                                    <Bookmark size={14} fill={story.is_saved ? "currentColor" : "none"} />
                                </button>
                                {bookmarkToast && (
                                    <div className={`absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-[10px] font-bold shadow-sm z-30 transition-all animate-in fade-in slide-in-from-top-1 ${bookmarkToast === 'saved' ? 'bg-blue-500 text-white' : 'bg-slate-500 text-white'
                                        }`}>
                                        {bookmarkToast === 'saved' ? 'Bookmarked' : 'Removed'}
                                    </div>
                                )}
                            </div>
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

                        {/* AI Summary Toggle */}
                        {story.summary && (
                            <button
                                onClick={() => setShowSummary(!showSummary)}
                                className={`p-1 transition-colors rounded-md mr-1 ${showSummary
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent'}`}
                                title={showSummary ? "Hide AI Summary" : "Show AI Summary"}
                            >
                                <Sparkles size={14} className={showSummary ? 'fill-current' : ''} />
                            </button>
                        )}

                        {/* Skip/Delete Button */}
                        <button
                            onClick={() => onHide?.(story.id)}
                            className="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors bg-slate-100 dark:bg-slate-800 rounded-md"
                            title="Skip / Hide this story"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Container: Article/Discussion + optional right Summary Sidebar */}
            <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                {/* Main content area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col min-h-0">
                    {/* AI Summary Zen Overlay */}
                    {activeTab === 'discussion' ? (
                        <div
                            ref={containerRef}
                            className="flex-1 w-full max-w-5xl mx-auto relative cursor-text select-text pointer-events-auto px-6 pb-6 pt-3"
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
                        <div className="flex-1 flex flex-col min-h-0">
                            {articleLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                                    <RefreshCw size={24} className="animate-spin text-teal-500" />
                                    <span className="animate-pulse font-medium">Fetching article...</span>
                                </div>
                            ) : articleError ? (
                                <div className="p-10 text-center">
                                    <div className="inline-block p-4 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 text-sm max-w-md">
                                        {articleError}
                                        <div className="mt-2">
                                            <a href={storyUrl} target="_blank" rel="noreferrer" className="underline font-bold">Open in new tab</a>
                                        </div>
                                    </div>
                                </div>
                            ) : useIframe ? (
                                // Web View (Iframe)
                                <div className="flex-1 w-full h-full bg-white overflow-hidden relative">
                                    {!canIframe && (
                                        <div className="absolute top-0 left-0 right-0 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-4 py-2 text-[10px] text-center border-b border-amber-100 dark:border-amber-900/50 z-10 opacity-70 hover:opacity-100 transition-opacity">
                                            Note: Site might block embedding. Switch to <b>Reader View</b> if blank.
                                        </div>
                                    )}
                                    <iframe
                                        src={storyUrl}
                                        className="w-full h-full border-0 absolute inset-0"
                                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                                        title="Article Web View"
                                    />
                                </div>
                            ) : (
                                // Reader View (Sanitized HTML)
                                <div className="flex-1 w-full max-w-3xl mx-auto py-8 px-6">
                                    <article
                                        className="prose prose-sm md:prose-base dark:prose-invert prose-slate max-w-none"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(articleContent || '') }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right AI Summary Sidebar */}
                {showSummary && story.summary && (
                    <div className="w-72 shrink-0 h-full overflow-y-auto border-l border-amber-200/50 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-900/10 backdrop-blur-sm flex flex-col animate-in slide-in-from-right-4 duration-300">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-amber-200/60 dark:border-amber-500/20 flex items-center justify-between bg-amber-100/60 dark:bg-amber-500/10 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-amber-500 dark:text-amber-400" />
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">AI Summary</h4>
                            </div>
                            <button
                                onClick={() => setShowSummary(false)}
                                className="p-1 rounded text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
                                title="Close"
                            >
                                <X size={12} />
                            </button>
                        </div>

                        {/* Tags */}
                        {story.topics && story.topics.length > 0 && (
                            <div className="px-4 pt-4 pb-2">
                                <p className="text-[9px] uppercase tracking-widest font-bold text-amber-500/80 dark:text-amber-500/60 mb-2">Tags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {story.topics.map(topic => (
                                        <span
                                            key={topic}
                                            className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30"
                                        >
                                            #{topic.replace(/\s+/g, '')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Summary Text */}
                        <div className="flex-1 px-4 pb-6 pt-3">
                            <p className="text-[9px] uppercase tracking-widest font-bold text-amber-500/80 dark:text-amber-500/60 mb-3">Summary</p>
                            <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-100/80 font-medium prose prose-slate dark:prose-invert prose-p:my-2 prose-li:my-1 prose-ul:my-2 prose-sm max-w-none">
                                <ReactMarkdown>{story.summary}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
