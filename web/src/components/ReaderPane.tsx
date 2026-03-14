import { useRef, useEffect, useState } from 'react';
import { getApiBase } from '../utils/apiBase';
import { createPortal } from 'react-dom';
import { Check, ExternalLink, Link, MessageSquare, RefreshCw, Bookmark, Sparkles, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
    is_saved?: boolean;
    summary?: string;
    topics?: string[];
}

interface ReaderPaneProps {
    story: Story;
    onFocusList?: () => void;
    onSummarize?: () => void;
    onTakeFocus?: () => void;
    initialActiveCommentId?: string | null;
    onSaveProgress?: (commentId: string) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    activeTab?: 'discussion' | 'article' | 'split';
    onTabChange?: (tab: 'discussion' | 'article' | 'split') => void;
    onHide?: (id: number) => void;
    isActive?: boolean;
}

export function ReaderPane({ story, onFocusList, onSummarize, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab: activeTabProp, onHide, isActive }: ReaderPaneProps) {
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


    const [isCopied, setIsCopied] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [userManuallyToggledSummary, setUserManuallyToggledSummary] = useState(false);

    // Self-managed comments state
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);

    useEffect(() => {
        setComments([]);
        setCommentsLoading(true);
        const baseUrl = getApiBase();
        const controller = new AbortController();
        fetch(`${baseUrl}/api/stories/${story.id}`, { signal: controller.signal })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) setComments(data.comments || []);
                setCommentsLoading(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') setCommentsLoading(false);
            });
        return () => controller.abort();
    }, [story.id]);

    const [summarizing, setSummarizing] = useState(false);


    const handleSummarize = async () => {
        setSummarizing(true);
        const baseUrl = getApiBase();
        try {
            await fetch(`${baseUrl}/api/stories/${story.id}/summarize`, { method: 'POST' });
        } catch (err) {
            console.error('Summarization failed:', err);
        } finally {
            setSummarizing(false);
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

    // Reset article state when story changes
    useEffect(() => {
        // No longer fetching text content; webview handles itself via src prop
    }, [story.id]);

    return (
        <div className="relative h-full flex flex-col bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* Mode Switcher Portal Removed - Now in Settings */}

            {/* Action Bar Portal (Targets Right of Branding) */}
            {isActive && createPortal(
                <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-1 duration-200">
                    <a href={storyUrl} target="_blank" rel="noreferrer" className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors" title="Open in new tab"><ExternalLink size={14} /></a>
                    <button onClick={handleCopyLink} className={`p-1 rounded-md transition-all ${isCopied ? 'text-green-500' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title={isCopied ? 'Copied!' : 'Copy Link'}>{isCopied ? <Check size={14} /> : <Link size={14} />}</button>

                    {onToggleSave && (
                        <button onClick={() => {
                            const nextSaved = !story.is_saved;
                            onToggleSave(story.id, nextSaved);
                        }} className={`p-1 rounded-md transition-all ${story.is_saved ? 'text-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10' : 'text-slate-400 hover:text-yellow-500 hover:bg-yellow-50/50'}`} title={story.is_saved ? 'Unbookmark' : 'Bookmark'}>
                            <Bookmark size={14} fill={story.is_saved ? "currentColor" : "none"} />
                        </button>
                    )}

                    {story.summary ? (
                        <button
                            onClick={() => {
                                setShowSummary(!showSummary);
                                setUserManuallyToggledSummary(!showSummary);
                            }}
                            className={`p-1 rounded-md transition-all ${userManuallyToggledSummary && showSummary ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50'}`}
                            title={userManuallyToggledSummary && showSummary ? "Unpin Summary" : "Pin Summary"}
                        >
                            <Sparkles size={14} className={userManuallyToggledSummary && showSummary ? 'fill-current' : ''} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSummarize}
                            disabled={summarizing}
                            className={`p-1 rounded-md transition-all text-slate-400 hover:text-orange-500 hover:bg-orange-50/50 disabled:opacity-50`}
                            title="Generate Summary"
                        >
                            <Sparkles size={14} className={summarizing ? 'animate-pulse text-orange-400' : ''} />
                        </button>
                    )}

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5"></div>

                    {/* Skip/Delete Button */}
                    <button
                        onClick={() => onHide?.(story.id)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors rounded-md"
                        title="Skip / Hide this story"
                    >
                        <X size={14} />
                    </button>
                </div>,
                document.getElementById('reader-actions-portal') || document.body
            )}

            {/* Content Container: Article/Discussion + optional right Summary Sidebar */}
            <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                {/* Main content area */}
                <div className={`flex-1 custom-scrollbar relative min-h-0 ${activeTab === 'split' ? 'flex flex-row overflow-hidden' : 'flex flex-col overflow-y-auto'}`}>

                    {/* Article Tab Content — Always Web View in Electron */}
                    {(activeTab === 'article' || activeTab === 'split') && (
                        <div className={`flex flex-col min-h-0 ${activeTab === 'split' ? 'flex-1 overflow-y-auto border-r border-slate-200 dark:border-white/5' : 'flex-1'}`}>
                            <div className="flex-1 w-full h-full bg-white overflow-hidden relative">
                                <webview
                                    src={storyUrl}
                                    className="w-full h-full border-0 absolute inset-0 bg-white"
                                    title="Article Web View"
                                />
                            </div>
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
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">Article Summary by AI</h4>
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
