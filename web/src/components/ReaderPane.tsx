import { useRef, useEffect, useState, useCallback } from 'react';
import type { Story } from '../types';
import { getApiBase, subscribeApiBase } from '../utils/apiBase';
import { isWebPreview } from '../utils/env';
import { fetchWithAuth } from '../utils/api';
import { Check, ExternalLink, Link, RefreshCw, Bookmark, Sparkles, ArrowLeft, Home, MessageSquare, FileText, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
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
    activeTopics?: string[];
}

export function ReaderPane({ 
    story, onBack, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, isActive, onSetGlobalWarning, onSetIframeBlocked, user,
    isAISidebarOpen = true,
    onToggleAISidebar,
    onSetSummary,
    onSetDiscussionSummary,
    activeTopics = []
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
    const [isIngesting, setIsIngesting] = useState(false);

    const articleWebviewRef = useRef<any>(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [currentUrl, setCurrentUrl] = useState(storyUrl);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const webview = articleWebviewRef.current;
        if (!webview) return;

        const injectStyles = () => {
            const isDark = document.documentElement.classList.contains('dark');
            
            // Inject Scrollbars (Native dark mode doesn't always theme scrollbars)
            const scrollbarCSS = `
                ::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
                ::-webkit-scrollbar-track { background: ${isDark ? '#0f172a' : '#f1f5f9'} !important; }
                ::-webkit-scrollbar-thumb { background: ${isDark ? '#334155' : '#cbd5e1'} !important; border-radius: 9999px !important; border: 2px solid ${isDark ? '#0f172a' : '#f1f5f9'} !important; }
                ::-webkit-scrollbar-thumb:hover { background: ${isDark ? '#475569' : '#94a3b8'} !important; }
            `;
            webview.insertCSS(scrollbarCSS).catch(() => {});

            // 2. Safe Dark Mode: Forced Selective Colors (More readable than inversion)
            if (isDark) {
                const js = `
                    (function() {
                        const id = 'hn-station-safe-dark';
                        if (document.getElementById(id)) return;
                        const style = document.createElement('style');
                        style.id = id;
                        style.textContent = \`
                            /* Force dark background on root and body */
                            html, body {
                                background-color: #0f172a !important;
                                color: #cbd5e1 !important;
                            }
                            /* Targeted selection to darken generic containers */
                            div, section, main, article, header, footer, nav, aside {
                                background-color: transparent !important;
                            }
                            /* Ensure text is light and readable */
                            p, span, li, a, b, strong, i, em, h1, h2, h3, h4, h5, h6 {
                                color: #cbd5e1 !important;
                            }
                            h1, h2, h3, h4, h5, h6 {
                                color: #f8fafc !important;
                            }
                            a {
                                color: #38bdf8 !important;
                            }
                            /* Code and Preformatted blocks */
                            pre, code {
                                background-color: #1e293b !important;
                                color: #e2e8f0 !important;
                                padding: 4px !important;
                                border-radius: 4px !important;
                            }
                            /* Handle common transparent issues */
                            * {
                                border-color: #334155 !important;
                            }
                        \`;
                        document.head.appendChild(style);
                    })();
                `;
                webview.executeJavaScript(js).catch(() => {});
            }
        };

        const updateNavigation = () => {
            try {
                setCanGoBack(webview.canGoBack());
                setCanGoForward(webview.canGoForward());
                setCurrentUrl(webview.getURL());
            } catch (e) {}
        };

        const handleLoadStart = () => setIsLoading(true);
        const handleLoadStop = () => {
            setIsLoading(false);
            updateNavigation();
        };

        webview.addEventListener('dom-ready', injectStyles);
        webview.addEventListener('did-finish-load', injectStyles);
        webview.addEventListener('did-navigate', updateNavigation);
        webview.addEventListener('did-navigate-in-page', updateNavigation);
        webview.addEventListener('did-start-loading', handleLoadStart);
        webview.addEventListener('did-stop-loading', handleLoadStop);
        
        return () => {
            webview.removeEventListener('dom-ready', injectStyles);
            webview.removeEventListener('did-finish-load', injectStyles);
            webview.removeEventListener('did-navigate', updateNavigation);
            webview.removeEventListener('did-navigate-in-page', updateNavigation);
            webview.removeEventListener('did-start-loading', handleLoadStart);
            webview.removeEventListener('did-stop-loading', handleLoadStop);
        };
    }, [story.id]);

    useEffect(() => {
        return subscribeApiBase(url => {
            if (url) setBaseUrl(url);
        });
    }, []);

    const loadContent = (id: number, apiUrl: string) => {
        if (!apiUrl) return;
        // Only clear if switching stories, with safety check for empty array
        setComments(prev => (prev && prev.length > 0 && prev[0].story_id === id) ? prev : []);
        setCommentsLoading(true);
        const controller = new AbortController();
        fetchWithAuth(`${apiUrl}/api/stories/${id}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return res.json();
                } else {
                    throw new Error("Oops, we haven't got JSON!");
                }
            })
            .then(data => {
                if (data) {
                    const commentsArr = data.comments || [];
                    setComments(commentsArr);
                    setIsIngesting(data.is_ingesting_comments || false);
                    if (data.story && data.story.iframe_blocked !== undefined) {
                        setIframeBlocked(data.story.iframe_blocked);
                        onSetIframeBlocked?.(id, data.story.iframe_blocked);
                    }
                }
                setCommentsLoading(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error(`[ReaderPane] Load failed for ${id}:`, err);
                    setCommentsLoading(false);
                    setIsIngesting(false);
                }
            });
        return controller;
    };

    useEffect(() => {
        let controller: AbortController | undefined;
        if (story.id && baseUrl) {
            controller = loadContent(story.id, baseUrl);

            // Also explicitly check iframe if not known
            if (isWebPreview() && story.url && story.iframe_blocked === undefined) {
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
        }

        return () => {
            if (controller) controller.abort();
        };
    }, [story.id, baseUrl]);

    // NEW: Poll for comments if backend is ingesting them
    useEffect(() => {
        if (isIngesting) {
            const interval = setInterval(() => {
                const baseUrl = getApiBase();
                fetchWithAuth(`${baseUrl}/api/stories/${story.id}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(data => {
                        if (data) {
                            setComments(data.comments || []);
                            setIsIngesting(data.is_ingesting_comments || false);
                        }
                    })
                    .catch(() => setIsIngesting(false));
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [isIngesting, story.id]);


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
    const resizeRef = useRef<number | null>(null);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        if (resizeRef.current) {
            cancelAnimationFrame(resizeRef.current);
            resizeRef.current = null;
        }
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (!isResizing) return;
        
        if (resizeRef.current) cancelAnimationFrame(resizeRef.current);
        
        resizeRef.current = requestAnimationFrame(() => {
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < Math.min(window.innerWidth * 0.8, 1200)) {
                setSidebarWidth(newWidth);
            }
        });
    }, [isResizing]);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', resize);
            document.addEventListener('mouseup', stopResizing);
            // Prevent text selection while resizing
            document.body.style.userSelect = 'none';
        } else {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResizing);
            document.body.style.userSelect = '';
        }

        return () => {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResizing);
            document.body.style.userSelect = '';
            if (resizeRef.current) cancelAnimationFrame(resizeRef.current);
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
        <div className="relative h-full flex flex-col bg-white dark:bg-[#111d2e] shadow-[0_-1px_0_0_rgba(255,255,255,0.05)] overflow-hidden">
            
            {/* Horizontal Browser Chrome (URL Bar & Controls) */}
            <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-white/5 shrink-0">
                {/* 1. Main Navigation */}
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={() => {
                            if (articleWebviewRef.current) {
                                articleWebviewRef.current.src = storyUrl;
                            }
                        }} 
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all" 
                        title="Reset to Original Article"
                    >
                        <Home size={18} />
                    </button>

                    {onToggleSave && (
                        <button 
                            onClick={() => onToggleSave(story.id, !story.is_saved)} 
                            className={`p-1.5 rounded-lg transition-all ${story.is_saved ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : 'text-slate-400 hover:text-yellow-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} 
                            title={story.is_saved ? 'Unbookmark' : 'Bookmark'}
                        >
                            <Bookmark size={18} fill={story.is_saved ? "currentColor" : "none"} />
                        </button>
                    )}

                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                    <button 
                        onClick={() => articleWebviewRef.current?.goBack()} 
                        disabled={!canGoBack}
                        className={`p-1.5 rounded-lg transition-all ${canGoBack ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800' : 'text-slate-300 dark:text-slate-700 opacity-50'}`}
                        title="Go Back"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <button 
                        onClick={() => articleWebviewRef.current?.goForward()} 
                        disabled={!canGoForward}
                        className={`p-1.5 rounded-lg transition-all ${canGoForward ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800' : 'text-slate-300 dark:text-slate-700 opacity-50'}`}
                        title="Go Forward"
                    >
                        <ChevronRight size={18} />
                    </button>
                    <button 
                        onClick={() => articleWebviewRef.current?.reload()} 
                        className={`p-1.5 rounded-lg transition-all text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 ${isLoading ? 'animate-spin' : ''}`}
                        title="Reload"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>

                {/* 2. URL Address Bar */}
                <div className="flex-1 max-w-2xl flex items-center bg-white dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 gap-2 group transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50">
                    <div className="text-green-500/70">
                        <Lock size={12} />
                    </div>
                    <div className="flex-1 text-[13px] text-slate-600 dark:text-slate-400 truncate select-all">
                        {currentUrl}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                            onClick={handleCopyLink}
                            className={`p-1 rounded-md transition-all ${isCopied ? 'text-green-500 bg-green-50' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            title="Copy URL"
                        >
                            {isCopied ? <Check size={14} /> : <Link size={14} />}
                        </button>
                        <a 
                            href={currentUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="p-1 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-all"
                            title="Open in Browser"
                        >
                            <ExternalLink size={14} />
                        </a>
                    </div>
                </div>

                {/* 3. Integrated Tools */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                        <button 
                            onClick={() => onToggleAISidebar?.(false)}
                            className={`px-3 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 ${!isAISidebarOpen ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="Reader View"
                        >
                            <FileText size={14} />
                            Reader
                        </button>
                        <button 
                            onClick={() => { setSidebarTab('discussion'); onToggleAISidebar?.(true); }}
                            className={`px-3 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 ${isAISidebarOpen && sidebarTab === 'discussion' ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="Discussion"
                        >
                            <MessageSquare size={14} />
                            Chat
                        </button>
                        <button 
                            onClick={() => { setSidebarTab('gemini'); onToggleAISidebar?.(true); }}
                            className={`px-3 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 ${isAISidebarOpen && sidebarTab === 'gemini' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="AI Assistant"
                        >
                            <Sparkles size={14} />
                            AI
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-row min-w-0 h-full relative overflow-hidden">
                {/* Resizing Overlay */}
                {isResizing && (
                    <div 
                        className="fixed inset-0 z-[9999] cursor-col-resize bg-transparent"
                        onMouseUp={stopResizing}
                    />
                )}
                
                {/* Article Content */}
                <div ref={paneRef} className="flex-1 bg-white relative overflow-hidden h-full">
                    {!isWebMode ? (
                        <webview
                            ref={articleWebviewRef}
                            src={storyUrl}
                            className="w-full h-full border-0 absolute inset-0 bg-white"
                            title="Article Web View"
                        />
                    ) : iframeBlocked ? (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-slate-900/50">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
                                <ExternalLink size={32} className="text-red-500" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Iframe Preview Blocked</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm text-sm">
                                This website prohibits being nested in other apps. Please use the Discussion tab on the right to read the conversation.
                            </p>
                            <a href={storyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all">
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
                    isIngesting={isIngesting}
                    activeCommentId={activeCommentId}
                    onFocusComment={(id) => {
                        setActiveCommentId(id);
                        onTakeFocus?.();
                    }}
                    activeTab={sidebarTab}
                    onTabChange={setSidebarTab}
                    containerRef={containerRef}
                    width={sidebarWidth}
                    activeTopics={activeTopics}
                />
            </div>
        </div>
    );
}
