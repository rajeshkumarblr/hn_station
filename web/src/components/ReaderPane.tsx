import { useRef, useEffect, useState, useCallback } from 'react';
import type { Story } from '../types';
import { getApiBase } from '../utils/apiBase';
import { isWebPreview } from '../utils/env';
import { fetchWithAuth } from '../utils/api';
import { Check, ExternalLink, Link, RefreshCw, Bookmark, Sparkles, X, ArrowLeft, Home, MessageSquare, FileText } from 'lucide-react';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { AISidebar } from './AISidebar';


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
    user?: any;
    onOpenSettings?: () => void;
    isAISidebarOpen?: boolean;
    onToggleAISidebar?: (open: boolean) => void;
    onSetSummary?: (id: number, summary: string, topics: string[]) => void;
    onSetDiscussionSummary?: (id: number, summary: string) => void;
}

export function ReaderPane({ 
    story, onBack, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, onHide, isActive, onSetGlobalWarning, onSetIframeBlocked, user,
    isAISidebarOpen = true,
    onToggleAISidebar,
    onSetSummary,
    onSetDiscussionSummary
}: ReaderPaneProps) {
    // Always use HTTPS to avoid mixed-content errors on the HTTPS site
    const rawUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const storyUrl = rawUrl.replace(/^http:\/\//, 'https://');

    const containerRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const isWebMode = isWebPreview();
    const [iframeBlocked, setIframeBlocked] = useState<boolean>(story.iframe_blocked || false);
    const [sidebarTab, setSidebarTab] = useState<'discussion' | 'summary' | 'gemini'>('discussion');

    const [isCopied, setIsCopied] = useState(false);
    
    // Sidebar resizing state
    const [sidebarWidth, setSidebarWidth] = useState(480);
    const [isResizing, setIsResizing] = useState(false);

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
        // Initial load
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
    }, [story.id]);


    // Handle iframe blocked transition
    useEffect(() => {
        if (isWebMode && iframeBlocked) {
            setSidebarTab('discussion');
            onToggleAISidebar?.(true);
            onSetGlobalWarning?.("Article refuses to be displayed in an i-frame; switching to discussion.");
        }
    }, [iframeBlocked, isWebMode, onSetGlobalWarning]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(storyUrl);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleCollapse = (commentId: string) => {
        const node = containerRef.current?.querySelector(`[data-comment-id="${commentId}"]`);
        const btn = node?.querySelector('button');
        if (btn) (btn as HTMLButtonElement).click();
    };

    const { activeCommentId, setActiveCommentId } = useKeyboardNav(
        containerRef,
        commentsLoading,
        handleCollapse,
        () => {
            setSidebarTab('summary');
            onToggleAISidebar?.(true);
        },
        onHome,
        initialActiveCommentId
    );

    // --- Resizing Handlers ---
    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < 900) {
                setSidebarWidth(newWidth);
            }
        }
    }, [isResizing]);

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
    }, [isResizing, resize, stopResizing]);

    // --- Local Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isActive) return;
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            if (e.ctrlKey) {
                switch (e.key.toLowerCase()) {
                    case 'q':
                        e.preventDefault();
                        onToggleAISidebar?.(false);
                        break;
                    case 'g':
                        e.preventDefault();
                        setSidebarTab('gemini');
                        onToggleAISidebar?.(true);
                        break;
                    case 'h':
                        e.preventDefault();
                        setSidebarTab('discussion');
                        onToggleAISidebar?.(true);
                        break;
                    case 'k':
                        e.preventDefault();
                        setSidebarTab('summary');
                        onToggleAISidebar?.(true);
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, onToggleAISidebar]);

    // Sync progress
    useEffect(() => {
        if (activeCommentId) {
            onSaveProgress?.(activeCommentId);
        }
    }, [activeCommentId, onSaveProgress]);


    return (
        <div className="relative h-full flex flex-row bg-white dark:bg-[#111d2e] border-t border-slate-200 dark:border-white/5 shadow-[0_-1px_0_0_rgba(255,255,255,0.05)] overflow-hidden">

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

                {/* 2. Mode Selectors - Updated for Sidebar Focus */}
                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => onToggleAISidebar?.(false)}
                        className={`p-2 rounded-lg transition-all ${!isAISidebarOpen ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40 shadow-sm' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                        title="Focus Article (Hide Sidebar)"
                    >
                        <FileText size={18} />
                    </button>
                    <button 
                        onClick={() => { setSidebarTab('discussion'); onToggleAISidebar?.(true); }}
                        className={`p-2 rounded-lg transition-all ${isAISidebarOpen && sidebarTab === 'discussion' ? 'text-orange-500 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/40 shadow-sm' : 'text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20'}`}
                        title="Show Discussion"
                    >
                        <MessageSquare size={18} />
                    </button>

                    <button 
                        onClick={() => { setSidebarTab('gemini'); onToggleAISidebar?.(true); }}
                        className={`p-2 rounded-lg transition-all ${isAISidebarOpen && sidebarTab === 'gemini' ? 'text-blue-500 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40 shadow-sm focus:outline-none' : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                        title="Chat with Gemini (Ctrl+G)"
                    >
                        <div className="w-[18px] h-[18px] rounded-full bg-slate-400 flex items-center justify-center text-[10px] text-white font-bold group-hover:bg-blue-500">G</div>
                    </button>

                    <button 
                        onClick={() => { setSidebarTab('summary'); onToggleAISidebar?.(true); }}
                        className={`p-2 rounded-lg transition-all ${isAISidebarOpen && sidebarTab === 'summary' ? 'text-amber-500 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/40 shadow-sm focus:outline-none' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                        title="AI Summary (Ctrl+K)"
                    >
                        <Sparkles size={18} />
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
                            className={`p-2 rounded-lg transition-all group ${story.is_saved ? 'text-yellow-500 bg-yellow-500/10 dark:bg-yellow-500/20 border border-yellow-500/50' : 'text-slate-400 hover:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'}`} 
                            title={story.is_saved ? 'Unbookmark' : 'Bookmark'}
                        >
                            <Bookmark size={18} fill={story.is_saved ? "currentColor" : "none"} className={story.is_saved ? "drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]" : ""} />
                        </button>
                    )}
                </div>

                <div className="flex-1"></div>
            </div>

            {/* Main Content Area Container */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                <div className="flex-1 flex flex-row min-h-0 overflow-hidden relative">
                    
                    {/* Article view is now the ONLY main content area */}
                    <div ref={paneRef} className="flex-1 bg-white relative overflow-hidden h-full">
                        {isWebMode ? (
                            iframeBlocked ? (
                                <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900/50">
                                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                                        <ExternalLink size={32} className="text-red-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Iframe Preview Blocked</h3>
                                    <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm text-sm">
                                        This website prohibits being nested in other apps. Please use the Discussion tab on the right to read the conversation.
                                    </p>
                                    <a
                                        href={storyUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all"
                                    >
                                        Open Original Article <ExternalLink size={14} />
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
                                    
                    {/* Resizer Handle */}
                    {isAISidebarOpen && (
                        <div 
                            onMouseDown={startResizing}
                            className={`w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-50 flex items-center justify-center group ${isResizing ? 'bg-blue-500' : 'bg-transparent'}`}
                        >
                            <div className="w-[1px] h-8 bg-slate-300 dark:bg-slate-700 group-hover:bg-blue-400"></div>
                        </div>
                    )}

                    {/* Context Sidebar (Discussion + AI) */}
                    <AISidebar 
                        story={story}
                        isOpen={isAISidebarOpen}
                        onClose={() => onToggleAISidebar?.(false)}
                        user={user}
                        onSetSummary={(summary, topics) => {
                            onSetSummary?.(story.id, summary, topics);
                        }}
                        onSetDiscussionSummary={(summary) => {
                            onSetDiscussionSummary?.(story.id, summary);
                        }}
                        comments={comments}
                        commentsLoading={commentsLoading}
                        activeCommentId={activeCommentId}
                        onFocusComment={(id) => {
                            setActiveCommentId(id);
                            onTakeFocus?.();
                        }}
                        activeTab={sidebarTab}
                        onTabChange={setSidebarTab}
                        containerRef={containerRef}
                        width={sidebarWidth}
                    />
                </div>
            </div>
        </div>
    );
}
