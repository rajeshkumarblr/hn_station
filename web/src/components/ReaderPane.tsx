import { useRef, useEffect, useState } from 'react';
import type { Story } from '../types';
import { getApiBase } from '../utils/apiBase';
import { isWebPreview } from '../utils/env';
import { fetchWithAuth } from '../utils/api';
import { Check, ExternalLink, Link, MessageSquare, RefreshCw, Bookmark, Sparkles, X, ArrowLeft, FileText, Columns2, Home } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CommentList } from './CommentList';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { getTagStyle } from './StoryCard';


interface ReaderPaneProps {
    story: Story;
    onBack?: () => void;
    onHome?: () => void;
    onTakeFocus?: () => void;
    initialActiveCommentId?: string | null;
    onSaveProgress?: (commentId: string) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    activeTab?: 'discussion' | 'article' | 'split';
    onTabChange?: (tab: 'discussion' | 'article' | 'split') => void;
    onHide?: (id: number) => void;
    isActive?: boolean;
    onSetGlobalWarning?: (msg: string | null) => void;
    onSetIframeBlocked?: (storyId: number, blocked: boolean) => void;
}

export function ReaderPane({ story, onBack, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab: activeTabProp, onTabChange, onHide, onSetGlobalWarning, onSetIframeBlocked }: ReaderPaneProps) {
    // Always use HTTPS to avoid mixed-content errors on the HTTPS site
    const rawUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const storyUrl = rawUrl.replace(/^http:\/\//, 'https://');

    const containerRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const isWebMode = isWebPreview();
    const [activeTab, setActiveTab] = useState<'discussion' | 'article' | 'split'>(activeTabProp || 'article');
    const [iframeBlocked, setIframeBlocked] = useState<boolean>(story.iframe_blocked || false);

    // Sync activeTab with prop
    useEffect(() => {
        if (activeTabProp) {
            setActiveTab(activeTabProp);
        }
    }, [activeTabProp]);


    const [isCopied, setIsCopied] = useState(false);
    const [showSummary, setShowSummary] = useState(false);
    const [splitWidth, setSplitWidth] = useState(70); // percentage
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    const stopResizing = () => {
        setIsResizing(false);
    };

    const resize = (e: MouseEvent) => {
        if (!isResizing || !paneRef.current) return;
        const paneRect = paneRef.current.getBoundingClientRect();
        const newWidth = ((e.clientX - paneRect.left) / paneRect.width) * 100;
        if (newWidth > 15 && newWidth < 85) {
            setSplitWidth(newWidth);
        }
    };

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        } else {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing]);

    // Self-managed comments state
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);

    const loadContent = (id: number) => {
        setComments([]);
        setCommentsLoading(true);
        const baseUrl = getApiBase();
        const controller = new AbortController();
        fetchWithAuth(`${baseUrl}/api/stories/${id}`, { signal: controller.signal })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setComments(data.comments || []);
                    if (data.story && data.story.iframe_blocked !== undefined) {
                        setIframeBlocked(data.story.iframe_blocked);
                        onSetIframeBlocked?.(id, data.story.iframe_blocked);
                    }
                }
                setCommentsLoading(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') setCommentsLoading(false);
            });
        return controller;
    };

    useEffect(() => {
        const controller = loadContent(story.id);

        // Also explicitly check iframe if not known
        if (isWebMode && story.url && story.iframe_blocked === undefined) {
            const baseUrl = getApiBase();
            fetchWithAuth(`${baseUrl}/api/stories/${story.id}/check-iframe`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data && data.iframe_blocked !== undefined) {
                        setIframeBlocked(data.iframe_blocked);
                        onSetIframeBlocked?.(story.id, data.iframe_blocked);
                    }
                })
                .catch(err => console.error('Iframe check failed:', err));
        }

        return () => controller.abort();
    }, [story.id, isWebMode, story.url, story.iframe_blocked]);

    // Handle iframe blocked transition
    useEffect(() => {
        if (isWebMode && iframeBlocked && (activeTab === 'article' || activeTab === 'split')) {
            setActiveTab('discussion');
            onSetGlobalWarning?.("Article refuses to be displayed in an i-frame");
        }
    }, [iframeBlocked, isWebMode, activeTab, onSetGlobalWarning]);




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
        () => {
            if (story.summary) {
                setShowSummary(true);
            }
        },
        onHome,
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
                    onBack?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, onBack, storyUrl]);

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
        <div className="relative h-full flex flex-row bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)]">

            {/* NEW: Left Vertical Sidebar Toolbar */}
            <div className="w-12 flex flex-col items-center py-4 bg-slate-50 dark:bg-slate-900/30 border-r border-slate-200 dark:border-white/5 shrink-0 gap-4">
                {/* 1. Navigation & Quick Utilities */}
                <div className="flex flex-col gap-2">
                    <button onClick={onBack} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" title="Back to previous tab/feed">
                        <ArrowLeft size={18} />
                    </button>
                    <button onClick={onHome} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" title="Go to Feed">
                        <Home size={18} />
                    </button>
                    <button 
                        onClick={() => loadContent(story.id)}
                        disabled={commentsLoading}
                        className={`p-2 rounded-lg transition-all text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 ${commentsLoading ? 'animate-spin' : ''}`}
                        title="Refresh Content"
                    >
                        <RefreshCw size={18} />
                    </button>
                    <button
                        onClick={() => onHide?.(story.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-lg"
                        title="Close Reader"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="h-px w-6 bg-slate-200 dark:bg-slate-800"></div>

                {/* 2. Mode Selectors */}
                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => { if (!iframeBlocked) setActiveTab('article'); }}
                        disabled={iframeBlocked}
                        className={`p-2 rounded-lg transition-all ${activeTab === 'article' ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40 shadow-sm' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'} ${iframeBlocked ? 'opacity-20 cursor-not-allowed' : ''}`}
                        title="Article View"
                    >
                        <FileText size={18} />
                    </button>
                    <button 
                        onClick={() => setActiveTab('discussion')}
                        className={`p-2 rounded-lg transition-all ${activeTab === 'discussion' ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40 shadow-sm' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                        title="Discussion View"
                    >
                        <MessageSquare size={18} />
                    </button>
                    <button 
                        onClick={() => { if (!iframeBlocked) setActiveTab('split'); }}
                        disabled={iframeBlocked}
                        className={`p-2 rounded-lg transition-all ${activeTab === 'split' ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40 shadow-sm' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'} ${iframeBlocked ? 'opacity-20 cursor-not-allowed' : ''}`}
                        title="Split View"
                    >
                        <Columns2 size={18} />
                    </button>
                </div>

                <div className="h-px w-6 bg-slate-200 dark:bg-slate-800"></div>

                {/* 3. Story Actions */}
                <div className="flex flex-col gap-2">
                    <a href={storyUrl} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" title="Open in new tab">
                        <ExternalLink size={18} />
                    </a>
                    
                    <button 
                        onClick={handleCopyLink} 
                        className={`p-2 rounded-lg transition-all ${isCopied ? 'text-green-500 bg-green-50 dark:bg-green-900/10' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                        title={isCopied ? 'Copied!' : 'Copy Link'}
                    >
                        {isCopied ? <Check size={18} /> : <Link size={18} />}
                    </button>

                    {onToggleSave && (
                        <button 
                            onClick={() => {
                                const nextSaved = !story.is_saved;
                                onToggleSave(story.id, nextSaved);
                            }} 
                            className={`p-2 rounded-lg transition-all ${story.is_saved ? 'text-yellow-500 bg-yellow-50 dark:text-yellow-900/10' : 'text-slate-400 hover:text-yellow-500 hover:bg-yellow-50'}`} 
                            title={story.is_saved ? 'Unbookmark' : 'Bookmark'}
                        >
                            <Bookmark size={18} fill={story.is_saved ? "currentColor" : "none"} />
                        </button>
                    )}
                    {story.summary && (
                        <button
                            onClick={() => {
                                const nextState = !showSummary;
                                setShowSummary(nextState);
                                if (nextState && activeTab === 'discussion') {
                                    setActiveTab('split');
                                    onTabChange?.('split');
                                }
                            }}
                            className={`p-2 rounded-lg transition-all ${showSummary ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20 shadow-sm' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                            title="AI Summary"
                        >
                            <Sparkles size={18} />
                        </button>
                    )}
                </div>

                <div className="flex-1"></div>
            </div>

            {/* Main Content Area Container */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Content Container: Article/Discussion + optional right Summary Sidebar */}
                <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                    {/* Main content area */}
                    <div ref={paneRef} className={`flex-1 custom-scrollbar relative min-h-0 ${(activeTab === 'split') ? 'flex flex-row overflow-hidden' : 'flex flex-col overflow-y-auto'}`}>

                        {/* Article Tab Content */}
                        {(activeTab === 'article' || activeTab === 'split') && (
                            <div 
                                className={`flex flex-col min-h-0 relative ${activeTab === 'split' ? 'overflow-y-auto' : 'flex-1'}`}
                                style={{
                                    width: activeTab === 'split' ? `${splitWidth}%` : 'auto',
                                    flex: activeTab === 'split' ? 'none' : '1'
                                }}
                            >
                                <div className="flex-1 w-full h-full bg-white overflow-hidden relative">
                                    {isWebMode ? (
                                        iframeBlocked ? (
                                            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900/50">
                                                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                                                    <ExternalLink size={32} className="text-red-500" />
                                                </div>
                                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Iframe Preview Blocked</h3>
                                                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm text-sm">
                                                    This website prohibits being nested in other apps for security reasons.
                                                </p>
                                                <a
                                                    href={storyUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold transition-colors"
                                                >
                                                    Open in New Tab <ExternalLink size={14} />
                                                </a>
                                            </div>
                                        ) : (
                                            <iframe
                                                src={storyUrl}
                                                className="w-full h-full border-0 absolute inset-0 bg-white"
                                                title="Article Web View"
                                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                            />
                                        )
                                    ) : (
                                        <webview
                                            src={storyUrl}
                                            className="w-full h-full border-0 absolute inset-0 bg-white"
                                            title="Article Web View"
                                        />
                                    )}
                                </div>

                                {/* AI Summary (Nested under article) */}
                                {showSummary && story.summary && (
                                    <div
                                        className="flex-shrink-0 bg-amber-50/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-amber-200 dark:border-white/10 shadow-lg animate-in slide-in-from-bottom-2 duration-200 flex flex-col overflow-hidden"
                                        style={{ maxHeight: '40%' }}
                                        onMouseLeave={() => setShowSummary(false)}
                                    >
                                        {/* Header */}
                                        <div className="px-4 py-2 border-b border-amber-200/50 dark:border-white/5 flex items-center justify-between bg-amber-100/30 dark:bg-amber-500/5 flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={12} className="text-amber-500 dark:text-amber-400" />
                                                <h4 className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">AI Summary</h4>
                                            </div>
                                            <button
                                                onClick={() => setShowSummary(false)}
                                                className="p-1 rounded-full text-amber-400 hover:text-amber-600 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-white/5 transition-colors"
                                                title="Close"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>

                                        {/* Tags & Content */}
                                        <div className="flex-1 overflow-y-auto px-5 py-3 custom-scrollbar">
                                            {story.topics && story.topics.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mb-2">
                                                    {story.topics.map((topic: string) => {
                                                        const ts = getTagStyle(topic);
                                                        return (
                                                            <span
                                                                key={topic}
                                                                className="inline-flex items-center text-[9px] font-black px-2 py-0.5 rounded-md border shadow-sm transition-all hover:scale-105"
                                                                style={{
                                                                    backgroundColor: ts.bg,
                                                                    color: ts.color,
                                                                    borderColor: ts.border,
                                                                }}
                                                            >
                                                                #{topic.replace(/\s+/g, '')}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 font-medium prose prose-slate dark:prose-invert prose-p:my-0.5 prose-li:list-none prose-li:my-0 prose-ul:my-1 prose-ul:pl-0 max-w-none">
                                                <ReactMarkdown
                                                    components={{
                                                        li: ({node, ...props}) => {
                                                            const text = String(props.children);
                                                            let hash = 0;
                                                            for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
                                                            const colors = [
                                                                { dot: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]', text: 'text-blue-600 dark:text-blue-300' },
                                                                { dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]', text: 'text-emerald-600 dark:text-emerald-300' },
                                                                { dot: 'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]', text: 'text-purple-600 dark:text-purple-300' },
                                                                { dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]', text: 'text-amber-600 dark:text-amber-300' },
                                                                { dot: 'bg-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.5)]', text: 'text-pink-600 dark:text-pink-300' },
                                                                { dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]', text: 'text-cyan-600 dark:text-cyan-300' }
                                                            ];
                                                            const color = colors[Math.abs(hash) % colors.length];
                                                            return (
                                                                <li className="flex gap-2 items-start mb-1.5">
                                                                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                                                                    <span className={`${color.text} font-semibold`} {...props} />
                                                                </li>
                                                            );
                                                        },
                                                        p: ({node, ...props}) => <p className="mb-2" {...props} />,
                                                        strong: ({node, ...props}) => (
                                                            <strong className="text-blue-600 dark:text-blue-400 font-black" {...props} />
                                                        )
                                                    }}
                                                >
                                                    {story.summary}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Transparent overlay while resizing to prevent iframe from capturing events */}
                                {isResizing && (
                                    <div className="absolute inset-0 z-50 cursor-col-resize bg-transparent" />
                                )}
                            </div>
                        )}

                        {/* Draggable Divider */}
                        {activeTab === 'split' && (
                            <div
                                onMouseDown={startResizing}
                                className={`w-1.5 h-full cursor-col-resize group relative z-30 transition-colors hover:bg-blue-500/50 ${isResizing ? 'bg-blue-500/50' : 'bg-slate-200 dark:bg-slate-800/50'}`}
                            >
                                <div className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-blue-500 transition-opacity ${isResizing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                            </div>
                        )}

                        {/* Discussion Tab Content */}
                        {(activeTab === 'discussion' || activeTab === 'split') && (
                            <div
                                ref={containerRef}
                                className={`relative cursor-text select-text pointer-events-auto pl-4 pr-10 pb-10 pt-4 flex-1 overflow-y-auto`}
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

                </div>

            </div>
        </div>
    );
}
