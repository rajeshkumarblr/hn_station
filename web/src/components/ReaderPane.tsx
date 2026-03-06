import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, Link, MessageSquare, RefreshCw, Bookmark, Sparkles, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { CommentList } from './CommentList';
import { useKeyboardNav } from '../hooks/useKeyboardNav';

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
    activeTab?: 'discussion' | 'article' | 'split';
    onTabChange?: (tab: 'discussion' | 'article' | 'split') => void;
    onHide?: (id: number) => void;
}

export function ReaderPane({ story, comments, commentsLoading, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab: activeTabProp, onTabChange, onHide }: ReaderPaneProps) {
    // Always use HTTPS to avoid mixed-content errors on the HTTPS site
    const rawUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const storyUrl = rawUrl.replace(/^http:\/\//, 'https://');

    const containerRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<'discussion' | 'article' | 'split'>(activeTabProp || 'article');

    // Sync activeTab with prop
    useEffect(() => {
        if (activeTabProp) {
            setActiveTab(activeTabProp);
        }
    }, [activeTabProp]);

    // Internal tab change should notify parent if possible
    const handleTabChange = (tab: 'discussion' | 'article' | 'split') => {
        setActiveTab(tab);
        onTabChange?.(tab);
    };

    const [articleContent, setArticleContent] = useState<string | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [articleError, setArticleError] = useState<string | null>(null);
    const [useIframe, setUseIframe] = useState(true);
    const [canIframe, setCanIframe] = useState(true);
    const [contentType, setContentType] = useState<'html' | 'markdown' | 'text' | 'pdf'>('text');
    const [isCopied, setIsCopied] = useState(false);
    const [showSummary, setShowSummary] = useState(false); // Hidden by default
    const [userManuallyToggledSummary, setUserManuallyToggledSummary] = useState(false);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setPortalTarget(document.getElementById('reader-controls-portal'));
    }, [activeTab]);

    useEffect(() => {
        setPortalTarget(document.getElementById('reader-controls-portal'));
    }, [activeTab]);

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
        if ((activeTab === 'article' || activeTab === 'split') && !articleContent && !articleLoading) {
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
                    setContentType(data.content_type || 'text');

                    // If backend says we can iframe AND it's not Markdown/Text (where we prefer Reader View)
                    // we default to the web view. For GitHub readmes, we force Reader View.
                    const forceReaderView = data.content_type === 'markdown' || data.content_type === 'text';
                    setUseIframe(!forceReaderView && data.can_iframe);
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

    return (
        <div className="relative h-full flex flex-col bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* Global Action Bar Portal */}
            {portalTarget && createPortal(
                <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
                    {/* Compact Mode Switcher */}
                    <div className="flex bg-slate-800/50 p-0.5 rounded-md mr-1 border border-slate-700/30">
                        <button onClick={() => handleTabChange('article')} className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded transition-all ${activeTab === 'article' ? 'bg-[#1e293b] text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`} title="Article">Art</button>
                        <button onClick={() => handleTabChange('discussion')} className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded transition-all ${activeTab === 'discussion' ? 'bg-[#1e293b] text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`} title="Discussion">Disc</button>
                        <button onClick={() => handleTabChange('split')} className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded transition-all ${activeTab === 'split' ? 'bg-[#1e293b] text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`} title="Split View">Split</button>
                    </div>

                    {/* Web/Reader Toggle (Article and Split) */}
                    {(activeTab === 'article' || activeTab === 'split') && !articleLoading && !articleError && (
                        <div className="flex bg-slate-800/50 p-0.5 rounded-md mr-1 border border-slate-700/30">
                            <button onClick={() => setUseIframe(false)} className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded transition-all ${!useIframe ? 'bg-[#1e293b] text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`} title="Reader View">Text</button>
                            <button onClick={() => setUseIframe(true)} className={`px-2 py-1 text-[10px] uppercase tracking-wider font-bold rounded transition-all ${useIframe ? 'bg-[#1e293b] text-teal-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`} title="Web View">Web</button>
                        </div>
                    )}

                    <div className="h-4 w-px bg-slate-700/50 mx-1"></div>

                    <a href={storyUrl} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-blue-400 transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded-md" title="Open in new tab"><ExternalLink size={14} /></a>
                    <button onClick={handleCopyLink} className={`p-1.5 transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded-md ${isCopied ? 'text-green-400' : 'text-slate-400 hover:text-blue-400'}`} title={isCopied ? 'Copied!' : 'Copy Link'}>{isCopied ? <Check size={14} /> : <Link size={14} />}</button>

                    {onToggleSave && (
                        <button onClick={() => {
                            const nextSaved = !story.is_saved;
                            onToggleSave(story.id, nextSaved);
                        }} className={`p-1.5 transition-colors bg-slate-800/50 hover:bg-slate-700/50 rounded-md ${story.is_saved ? 'text-yellow-500' : 'text-slate-400 hover:text-yellow-400'}`} title={story.is_saved ? 'Unbookmark' : 'Bookmark'}>
                            <Bookmark size={14} fill={story.is_saved ? "currentColor" : "none"} />
                        </button>
                    )}

                    {story.summary && (
                        <button
                            onClick={() => {
                                setShowSummary(!showSummary);
                                setUserManuallyToggledSummary(!showSummary); // Pin it open if toggled on, unpin if toggled off
                            }}
                            className={`p-1.5 transition-colors rounded-md ${userManuallyToggledSummary && showSummary ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800/50 text-slate-400 hover:text-blue-400 hover:bg-slate-700/50'}`}
                            title={userManuallyToggledSummary && showSummary ? "Unpin AI Summary" : "Pin AI Summary"}
                        >
                            <Sparkles size={14} className={userManuallyToggledSummary && showSummary ? 'fill-current' : ''} />
                        </button>
                    )}

                    <div className="h-4 w-px bg-slate-700/50 mx-1"></div>

                    {/* Skip/Delete Button */}
                    <button
                        onClick={() => onHide?.(story.id)}
                        className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-colors bg-slate-800/50 rounded-md"
                        title="Skip / Hide this story"
                    >
                        <X size={14} />
                    </button>
                </div>,
                portalTarget
            )}

            {/* Content Container: Article/Discussion + optional right Summary Sidebar */}
            <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                {/* Main content area */}
                <div className={`flex-1 custom-scrollbar relative min-h-0 ${activeTab === 'split' ? 'flex flex-row overflow-hidden' : 'flex flex-col overflow-y-auto'}`}>

                    {/* Article Tab Content */}
                    {(activeTab === 'article' || activeTab === 'split') && (
                        <div className={`flex flex-col min-h-0 ${activeTab === 'split' ? 'flex-1 overflow-y-auto border-r border-slate-200 dark:border-white/5' : 'flex-1'}`}>
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
                            ) : contentType === 'pdf' ? (
                                // Native PDF View
                                <div className="flex-1 w-full h-full bg-slate-100 dark:bg-slate-900 overflow-hidden relative">
                                    <object
                                        data={storyUrl}
                                        type="application/pdf"
                                        className="w-full h-full border-0 absolute inset-0"
                                    >
                                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-500">
                                            <p className="font-medium text-center">Your browser does not support embedding PDFs.</p>
                                            <a href={storyUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 underline font-medium">Click here to view it natively or download.</a>
                                        </div>
                                    </object>
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
                                // Reader View (Markdown or Sanitized HTML)
                                <div className="flex-1 w-full max-w-3xl mx-auto py-8 px-6">
                                    <article className="prose prose-sm md:prose-base dark:prose-invert prose-slate max-w-none">
                                        {contentType === 'markdown' ? (
                                            <ReactMarkdown rehypePlugins={[rehypeRaw]}>{articleContent || ''}</ReactMarkdown>
                                        ) : (
                                            <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(articleContent || '') }} />
                                        )}
                                    </article>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Discussion Tab Content */}
                    {(activeTab === 'discussion' || activeTab === 'split') && (
                        <div
                            ref={containerRef}
                            className={`relative cursor-text select-text pointer-events-auto px-6 pb-6 pt-3 ${activeTab === 'split' ? 'flex-1 overflow-y-auto' : 'flex-1 w-full max-w-5xl mx-auto'}`}
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
                    )}
                </div>

                {/* Right AI Summary Sidebar */}
                {showSummary && story.summary && (
                    <div
                        className="w-72 shrink-0 h-full overflow-y-auto border-l border-amber-200/50 dark:border-amber-500/20 bg-amber-50/70 dark:bg-amber-900/10 backdrop-blur-sm flex flex-col animate-in slide-in-from-right-4 duration-300"
                        onMouseLeave={() => {
                            if (!userManuallyToggledSummary) {
                                setShowSummary(false);
                            }
                        }}
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-amber-200/60 dark:border-amber-500/20 flex items-center justify-between bg-amber-100/60 dark:bg-amber-500/10 sticky top-0 z-10">
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-amber-500 dark:text-amber-400" />
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">AI Summary</h4>
                            </div>
                            <button
                                onClick={() => { setShowSummary(false); setUserManuallyToggledSummary(false); }}
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

                {/* Invisible hover trigger zone for expanding summary when collapsed */}
                {!showSummary && story.summary && (
                    <div
                        className="absolute right-0 top-0 bottom-0 w-6 z-20 cursor-w-resize group"
                        onMouseEnter={() => {
                            if (!userManuallyToggledSummary) {
                                setShowSummary(true);
                            }
                        }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-amber-500/20 dark:bg-amber-500/30 rounded-l-md opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-0.5 h-8 bg-amber-500/50 rounded-full"></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
