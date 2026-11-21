import { useRef, useEffect, useState, useCallback } from 'react';
import type { Story } from '../types';
import { getApiBase, subscribeApiBase } from '../utils/apiBase';
import { isWebPreview } from '../utils/env';
import { fetchWithAuth } from '../utils/api';
import { Check, ExternalLink, Link, RefreshCw, Bookmark, Sparkles, MessageSquare, FileText, ChevronLeft, ChevronRight, Lock, Sun, Moon, Columns, BookOpen, Globe, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { AISidebar } from './AISidebar';

function sanitizeReaderHtml(rawHtml: string): string {
    if (typeof window === 'undefined' || !rawHtml) return '';
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    doc.querySelectorAll('script, style, iframe, object, embed, form, noscript').forEach(el => el.remove());
    doc.querySelectorAll('*').forEach(el => {
        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value))) {
                el.removeAttribute(attr.name);
            }
        }
        if (el.tagName === 'A') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noreferrer noopener');
        }
    });
    return doc.body.innerHTML;
}

interface ReaderPaneProps {
    story: Story;
    onHome?: () => void;
    onTakeFocus?: () => void;
    initialActiveCommentId?: string | null;
    onSaveProgress?: (commentId: string) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    activeTab?: 'discussion' | 'article' | 'split';
    onTabChange?: (tab: 'discussion' | 'article' | 'split') => void;
    onHide?: (id: number) => void;
    isActive?: boolean;
    onClose?: () => void;
    onSetGlobalWarning?: (msg: string | null) => void;
    onSetIframeBlocked?: (storyId: number, blocked: boolean) => void;
    user?: any;
    onOpenSettings?: () => void;
    isAISidebarOpen?: boolean;
    onToggleAISidebar?: (open: boolean) => void;
    onSetSummary?: (id: number, summary: string, topics: string[]) => void;
    onSetDiscussionSummary?: (id: number, summary: string) => void;
    activeTopics?: string[];
    disabledTopics?: string[];
    setActiveTopics?: React.Dispatch<React.SetStateAction<string[]>>;
    setDisabledTopics?: React.Dispatch<React.SetStateAction<string[]>>;
    topicMatch?: 'any' | 'all' | 'exclusive';
    onSummarizeStory?: (id: number) => Promise<any>;
}

export function ReaderPane({ 
    story, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab, onTabChange, isActive, onSetGlobalWarning, onSetIframeBlocked, user,
    onToggleAISidebar,
    onSetSummary,
    onSetDiscussionSummary,
    activeTopics = [],
    disabledTopics = [],
    setActiveTopics,
    setDisabledTopics,
    topicMatch = 'any',
    onSummarizeStory
}: ReaderPaneProps) {
    // Always use HTTPS to avoid mixed-content errors on the HTTPS site
    const rawUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
    const storyUrl = rawUrl.replace(/^http:\/\//, 'https://');

    const containerRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const isWebMode = isWebPreview();
    const [iframeBlocked, setIframeBlocked] = useState<boolean>(story.iframe_blocked || false);

    // Single-focus view mode by default ('article' | 'discussion' | 'ai'), with optional 'split'
    const resolveInitialView = (): 'article' | 'discussion' | 'ai' | 'split' => {
        if (isWebMode) return 'discussion';
        if (activeTab === 'discussion') return 'discussion';
        if (activeTab === 'split') return 'split';
        return story.url ? 'article' : 'discussion';
    };
    const [viewMode, setViewMode] = useState<'article' | 'discussion' | 'ai' | 'split'>(resolveInitialView);
    const [sidebarTab, setSidebarTab] = useState<'discussion' | 'summary' | 'ai'>('discussion');

    // Clean Reader Mode state (persisted in localStorage)
    const [isReaderMode, setIsReaderMode] = useState<boolean>(() => {
        try {
            return localStorage.getItem('hn_article_reader_mode') === 'true';
        } catch {
            return false;
        }
    });
    const [readerContent, setReaderContent] = useState<{ content: string; title: string; content_type: string } | null>(null);
    const [readerLoading, setReaderLoading] = useState<boolean>(false);
    const [readerError, setReaderError] = useState<string | null>(null);

    const toggleReaderMode = useCallback((next: boolean) => {
        setIsReaderMode(next);
        try {
            localStorage.setItem('hn_article_reader_mode', next ? 'true' : 'false');
        } catch { }
    }, []);

    const switchViewMode = useCallback((next: 'article' | 'discussion' | 'ai' | 'split') => {
        setViewMode(next);
        if (next === 'discussion') {
            setSidebarTab('discussion');
            onToggleAISidebar?.(true);
            onTabChange?.('discussion');
        } else if (next === 'ai') {
            setSidebarTab('ai');
            onToggleAISidebar?.(true);
        } else if (next === 'split') {
            onToggleAISidebar?.(true);
            onTabChange?.('split');
        } else {
            onToggleAISidebar?.(false);
            onTabChange?.('article');
        }
    }, [onToggleAISidebar, onTabChange]);

    const [isMobileView, setIsMobileView] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
    const [mobileTab, setMobileTab] = useState<'article' | 'comments' | 'ai'>('comments');

    useEffect(() => {
        const handleResize = () => {
            setIsMobileView(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        setMobileTab('comments');
        setSidebarTab('discussion');
        setReaderContent(null);
        setReaderError(null);
        setViewMode(resolveInitialView());
    }, [story.id]);

    // Sync if parent explicitly changes activeTab (e.g. clicking comment count on a card)
    useEffect(() => {
        if (isWebMode || !activeTab) return;
        if (activeTab === 'discussion' && viewMode === 'article') {
            setViewMode('discussion');
            setSidebarTab('discussion');
        } else if (activeTab === 'article' && viewMode === 'split') {
            setViewMode('article');
        }
    }, [activeTab]);

    useEffect(() => {
        if (mobileTab === 'ai' && sidebarTab === 'discussion') {
            setSidebarTab('ai');
        } else if (mobileTab === 'comments' && sidebarTab !== 'discussion') {
            setSidebarTab('discussion');
        }
    }, [mobileTab]);

    useEffect(() => {
        if (sidebarTab === 'discussion') {
            setMobileTab('comments');
        } else if (sidebarTab === 'ai' || sidebarTab === 'summary') {
            setMobileTab('ai');
        }
    }, [sidebarTab]);

    const [isCopied, setIsCopied] = useState(false);
    
    // Sidebar resizing state
    const [sidebarWidth, setSidebarWidth] = useState(480);
    const [isResizing, setIsResizing] = useState(false);

    // Self-managed comments state
    const [comments, setComments] = useState<any[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [isIngesting, setIsIngesting] = useState(false);
    const [articleDarkMode, setArticleDarkMode] = useState<'original' | 'dark' | 'auto'>('original');
    const [urlInput, setUrlInput] = useState(storyUrl);
    const addressInputRef = useRef<HTMLInputElement>(null);

    const articleWebviewRef = useRef<any>(null);
    const [baseUrl, setBaseUrl] = useState('');
    const [currentUrl, setCurrentUrl] = useState(storyUrl);

    useEffect(() => {
        setUrlInput(currentUrl);
    }, [currentUrl]);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const webview = articleWebviewRef.current;
        if (!webview) return;

        const injectStyles = () => {
            const isGlobalDark = document.documentElement.classList.contains('dark');
            const isDark = articleDarkMode === 'dark' || (articleDarkMode === 'auto' && isGlobalDark);
            
            const js = `
                (function() {
                    const darkId = 'hn-station-safe-dark';
                    const scrollId = 'hn-station-scrollbar';
                    
                    // 1. Handle Scrollbars
                    let scrollStyle = document.getElementById(scrollId);
                    if (!scrollStyle) {
                        scrollStyle = document.createElement('style');
                        scrollStyle.id = scrollId;
                        document.head.appendChild(scrollStyle);
                    }
                    scrollStyle.textContent = \`
                        ::-webkit-scrollbar { width: 10px !important; height: 10px !important; }
                        ::-webkit-scrollbar-track { background: ${isDark ? '#0f172a' : '#f1f5f9'} !important; }
                        ::-webkit-scrollbar-thumb { background: ${isDark ? '#334155' : '#cbd5e1'} !important; border-radius: 9999px !important; border: 2px solid ${isDark ? '#0f172a' : '#f1f5f9'} !important; }
                        ::-webkit-scrollbar-thumb:hover { background: ${isDark ? '#475569' : '#94a3b8'} !important; }
                    \`;

                    // 2. Handle Safe Dark Mode
                    let darkStyle = document.getElementById(darkId);
                    if (${isDark}) {
                        if (!darkStyle) {
                            darkStyle = document.createElement('style');
                            darkStyle.id = darkId;
                            darkStyle.textContent = \`
                                html, body { background-color: #0f172a !important; color: #cbd5e1 !important; }
                                div, section, main, article, header, footer, nav, aside { background-color: transparent !important; }
                                p, span, li, a, b, strong, i, em, h1, h2, h3, h4, h5, h6 { color: #cbd5e1 !important; }
                                h1, h2, h3, h4, h5, h6 { color: #f8fafc !important; }
                                a { color: #38bdf8 !important; }
                                pre, code { background-color: #1e293b !important; color: #e2e8f0 !important; padding: 4px !important; border-radius: 4px !important; }
                                * { border-color: #334155 !important; }
                            \`;
                            document.head.appendChild(darkStyle);
                        }
                    } else {
                        if (darkStyle) darkStyle.remove();
                    }
                })();
            `;
            try {
                webview.executeJavaScript(js).catch(() => {});
            } catch (e) {
                // Ignore errors if webview is not yet ready or attached
                // It will be re-injected via the dom-ready event listener
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

        const handleWillNavigate = (e: any) => {
            const url = e.url;
            if (url !== storyUrl && !url.startsWith('about:')) {
                e.preventDefault();
                (window as any).electronAPI?.openExternal?.(url);
            }
        };

        const handleNewWindow = (e: any) => {
            e.preventDefault();
            (window as any).electronAPI?.openExternal?.(e.url);
        };

        webview.addEventListener('will-navigate', handleWillNavigate);
        webview.addEventListener('new-window', handleNewWindow);
        webview.addEventListener('dom-ready', injectStyles);
        webview.addEventListener('did-finish-load', injectStyles);
        webview.addEventListener('did-navigate', updateNavigation);
        webview.addEventListener('did-navigate-in-page', updateNavigation);
        webview.addEventListener('did-start-loading', handleLoadStart);
        webview.addEventListener('did-stop-loading', handleLoadStop);
        
        // IMPORTANT: Call immediately if already loaded to handle theme toggle
        injectStyles();
        
        const handleKeyboard = (e: KeyboardEvent | any) => {
            // Alt+D: Focus Address Bar
            if (e.altKey && e.key.toLowerCase() === 'd') {
                if (e.preventDefault) e.preventDefault();
                addressInputRef.current?.focus();
                addressInputRef.current?.select();
            }
        };

        window.addEventListener('keydown', handleKeyboard);
        
        // Listen for forwarded shortcuts from Electron main process (webviews)
        if ((window as any).electronAPI?.onGlobalShortcut) {
            (window as any).electronAPI.onGlobalShortcut((data: any) => {
                handleKeyboard(data);
            });
        }
        
        return () => {
            window.removeEventListener('keydown', handleKeyboard);
            webview.removeEventListener('will-navigate', handleWillNavigate);
            webview.removeEventListener('new-window', handleNewWindow);
            webview.removeEventListener('dom-ready', injectStyles);
            webview.removeEventListener('did-finish-load', injectStyles);
            webview.removeEventListener('did-navigate', updateNavigation);
            webview.removeEventListener('did-navigate-in-page', updateNavigation);
            webview.removeEventListener('did-start-loading', handleLoadStart);
            webview.removeEventListener('did-stop-loading', handleLoadStop);
        };
    }, [story.id, articleDarkMode]);

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

    const refreshComments = useCallback(() => {
        if (!story.id) return;
        const baseUrl = getApiBase();
        if (!baseUrl) return;
        fetchWithAuth(`${baseUrl}/api/stories/${story.id}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data) {
                    setComments(data.comments || []);
                    setIsIngesting(data.is_ingesting_comments || false);
                }
            })
            .catch(err => console.error('Failed to refresh comments:', err));
    }, [story.id]);

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

    // Fetch clean Reader Mode content when Reader Mode is active
    useEffect(() => {
        if (!isReaderMode || !story.id || !story.url || !baseUrl || readerContent) return;
        let cancelled = false;
        setReaderLoading(true);
        setReaderError(null);
        fetchWithAuth(`${baseUrl}/api/stories/${story.id}/content`)
            .then(async res => {
                if (!res.ok) throw new Error(`Failed to extract readable content (${res.status})`);
                return res.json();
            })
            .then(data => {
                if (!cancelled) {
                    setReaderContent({
                        content: data.content || '',
                        title: data.title || story.title,
                        content_type: data.content_type || 'html',
                    });
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setReaderError(err.message || 'Could not load Reader Mode for this site');
                }
            })
            .finally(() => {
                if (!cancelled) setReaderLoading(false);
            });
        return () => { cancelled = true; };
    }, [isReaderMode, story.id, story.url, baseUrl, readerContent, story.title]);

    // Poll for comments only when tab is active AND backend is actively ingesting
    useEffect(() => {
        if (!story.id || !isActive || !isIngesting) return;

        let attempts = 0;
        const interval = setInterval(() => {
            if (document.hidden) return;
            attempts++;
            if (attempts > 10) {
                setIsIngesting(false);
                clearInterval(interval);
                return;
            }
            const baseUrl = getApiBase();
            if (!baseUrl) return;
            fetchWithAuth(`${baseUrl}/api/stories/${story.id}`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setComments(data.comments || []);
                        setIsIngesting(data.is_ingesting_comments || false);
                    }
                })
                .catch(() => {
                    if (isIngesting) setIsIngesting(false);
                });
        }, 5000);

        return () => clearInterval(interval);
    }, [isIngesting, isActive, story.id, baseUrl]);


    // Handle iframe blocked transition
    useEffect(() => {
        if (isWebMode && iframeBlocked) {
            setSidebarTab('discussion');
            onToggleAISidebar?.(true);
            onSetGlobalWarning?.("Article refuses to be displayed in an i-frame; switching to discussion.");
        }
    }, [iframeBlocked, isWebMode, onSetGlobalWarning]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(currentUrl);
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
                        switchViewMode('article');
                        break;
                    case 'g':
                        e.preventDefault();
                        switchViewMode('ai');
                        break;
                    case 'h':
                        e.preventDefault();
                        switchViewMode('discussion');
                        break;
                    case 'k':
                        e.preventDefault();
                        if (!isWebMode) {
                            switchViewMode('ai');
                        }
                        break;
                }
                return;
            }

            if (!e.metaKey && !e.altKey) {
                if (e.key === '1') {
                    e.preventDefault();
                    switchViewMode('article');
                } else if (e.key === '2') {
                    e.preventDefault();
                    switchViewMode('discussion');
                } else if (e.key === '3') {
                    e.preventDefault();
                    switchViewMode('ai');
                } else if (e.key === '4') {
                    e.preventDefault();
                    switchViewMode(viewMode === 'split' ? 'article' : 'split');
                } else if (e.key.toLowerCase() === 'r' && (viewMode === 'article' || viewMode === 'split')) {
                    e.preventDefault();
                    toggleReaderMode(!isReaderMode);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive, switchViewMode, viewMode, isWebMode, toggleReaderMode, isReaderMode]);

    // Sync progress
    useEffect(() => {
        if (activeCommentId) {
            onSaveProgress?.(activeCommentId);
        }
    }, [activeCommentId, onSaveProgress]);

    const showArticlePane = isMobileView ? (mobileTab === 'article') : (!isWebMode && (viewMode === 'article' || viewMode === 'split'));
    const showSidePane = isMobileView ? (mobileTab !== 'article') : (isWebMode || viewMode === 'discussion' || viewMode === 'ai' || viewMode === 'split');
    const isSplit = !isMobileView && !isWebMode && viewMode === 'split';
    const isSideFullWidth = !isMobileView && !isWebMode && (viewMode === 'discussion' || viewMode === 'ai');
    const commentCount = comments.length > 0 ? comments.length : (story.descendants || 0);

    return (
        <div className="relative h-full flex flex-col bg-white dark:bg-[#131824] overflow-hidden">
            
            {/* Slim Single Reader Toolbar */}
            {!isWebMode && (
                <div className="flex items-center justify-between gap-3 px-3.5 h-[42px] bg-slate-50 dark:bg-[#161d2e] border-b border-slate-200 dark:border-slate-800/90 shrink-0 select-none">
                    {/* Left: Compact Navigation & URL */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {showArticlePane && !isReaderMode && (
                            <div className="flex items-center gap-0.5 shrink-0">
                                <button 
                                    onClick={() => articleWebviewRef.current?.goBack()} 
                                    disabled={!canGoBack}
                                    className={`p-1 rounded-md transition-colors ${canGoBack ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer' : 'text-slate-300 dark:text-slate-700'}`}
                                    title="Go Back"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <button 
                                    onClick={() => articleWebviewRef.current?.goForward()} 
                                    disabled={!canGoForward}
                                    className={`p-1 rounded-md transition-colors ${canGoForward ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer' : 'text-slate-300 dark:text-slate-700'}`}
                                    title="Go Forward"
                                >
                                    <ChevronRight size={16} />
                                </button>
                                <button 
                                    onClick={() => articleWebviewRef.current?.reload()} 
                                    className={`p-1 rounded-md transition-colors text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer ${isLoading ? 'animate-spin' : ''}`}
                                    title="Reload page"
                                >
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        )}

                        {onToggleSave && (
                            <button 
                                onClick={() => onToggleSave(story.id, !story.is_saved)} 
                                className={`p-1.5 rounded-md transition-colors shrink-0 cursor-pointer ${story.is_saved ? 'text-amber-500 hover:bg-amber-500/10' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800'}`} 
                                title={story.is_saved ? 'Remove bookmark' : 'Bookmark story'}
                            >
                                <Bookmark size={14} fill={story.is_saved ? "currentColor" : "none"} />
                            </button>
                        )}

                        {/* Slim URL Pill */}
                        <form 
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (articleWebviewRef.current && urlInput) {
                                    let targetUrl = urlInput.trim();
                                    if (!/^https?:\/\//i.test(targetUrl)) {
                                        targetUrl = 'https://' + targetUrl;
                                    }
                                    toggleReaderMode(false);
                                    articleWebviewRef.current.src = targetUrl;
                                }
                            }}
                            className="flex-1 max-w-xl flex items-center bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 gap-2 group focus-within:ring-1 focus-within:ring-sky-500/40"
                        >
                            <Lock size={11} className="text-emerald-500/70 shrink-0" />
                            <input 
                                ref={addressInputRef}
                                type="text"
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                className="flex-1 bg-transparent text-[12px] text-slate-600 dark:text-slate-300 outline-none w-full truncate"
                                spellCheck={false}
                            />
                            <div className="flex items-center gap-0.5 shrink-0">
                                <button 
                                    type="button"
                                    onClick={handleCopyLink}
                                    className={`p-1 rounded transition-colors cursor-pointer ${isCopied ? 'text-emerald-500' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                                    title="Copy URL"
                                >
                                    {isCopied ? <Check size={12} /> : <Link size={12} />}
                                </button>
                                <a 
                                    href={currentUrl} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                                    title="Open in default browser"
                                >
                                    <ExternalLink size={12} />
                                </a>
                            </div>
                        </form>
                    </div>

                    {/* Right: Reader/Web Toggle + Single-Focus View Switcher + Optional Split */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Reader vs Live Web Toggle (only when viewing Article or Split) */}
                        {showArticlePane && story.url && (
                            <div className="flex items-center bg-slate-200/70 dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                                <button
                                    onClick={() => toggleReaderMode(true)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${isReaderMode ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    title="Clean distraction-free Reader Mode (R)"
                                >
                                    <BookOpen size={12} />
                                    <span>Reader</span>
                                </button>
                                <button
                                    onClick={() => toggleReaderMode(false)}
                                    className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${!isReaderMode ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    title="Original Live Webpage (R)"
                                >
                                    <Globe size={12} />
                                    <span>Web</span>
                                </button>
                                {!isReaderMode && (
                                    <button
                                        onClick={() => setArticleDarkMode(prev => prev === 'dark' ? 'original' : 'dark')}
                                        className={`p-1 ml-0.5 rounded-md transition-colors cursor-pointer ${articleDarkMode === 'dark' ? 'text-amber-400 bg-slate-700/60' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                                        title={articleDarkMode === 'dark' ? 'Switch webpage to original light colors' : 'Apply dark mode to webpage'}
                                    >
                                        {articleDarkMode === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Primary Single-Focus Mode Switcher: Article | Discussion | AI */}
                        <div className="flex items-center bg-slate-200/70 dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                            <button 
                                onClick={() => switchViewMode('article')}
                                className={`px-2.5 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${viewMode === 'article' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                title="Full-width Article (1)"
                            >
                                <FileText size={13} />
                                <span>Article</span>
                            </button>
                            <button 
                                onClick={() => switchViewMode('discussion')}
                                className={`px-2.5 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${viewMode === 'discussion' ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                title="Full-width Discussion (2)"
                            >
                                <MessageSquare size={13} />
                                <span>Discussion{commentCount > 0 ? ` (${commentCount})` : ''}</span>
                            </button>
                            <button 
                                onClick={() => switchViewMode('ai')}
                                className={`px-2.5 py-1 rounded-md transition-all text-[11px] font-bold flex items-center gap-1.5 cursor-pointer ${viewMode === 'ai' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                title="Full-width AI Summary & Chat (3)"
                            >
                                <Sparkles size={13} />
                                <span>AI</span>
                            </button>
                        </div>

                        {/* Clear Maximize / Restore Split Toggle */}
                        <button
                            onClick={() => switchViewMode(viewMode === 'split' ? 'article' : 'split')}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                                viewMode === 'split'
                                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-300'
                                    : 'bg-white dark:bg-[#111726] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                            title={viewMode === 'split' ? 'Maximize Article (4)' : 'Restore Side-by-Side Split View (4)'}
                        >
                            {viewMode === 'split' ? (
                                <>
                                    <Columns size={12} />
                                    <span>Split</span>
                                </>
                            ) : (
                                <>
                                    <Minimize2 size={12} />
                                    <span>Split</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-row min-w-0 h-full relative overflow-hidden">
                {/* Resizing Overlay */}
                {isResizing && (
                    <div 
                        className="fixed inset-0 z-[9999] cursor-col-resize bg-transparent"
                        onMouseUp={stopResizing}
                    />
                )}
                
                {/* Article Pane (kept mounted in Desktop so switching Article <-> Discussion is instant!) */}
                {(!isWebMode || (isMobileView && mobileTab === 'article')) && (
                    <div 
                        ref={paneRef} 
                        className="flex-1 bg-white dark:bg-[#131824] relative overflow-hidden h-full"
                        style={{ display: showArticlePane ? 'block' : 'none' }}
                    >
                        {/* Floating Maximize Article button when in Split View */}
                        {isSplit && (
                            <button
                                onClick={() => switchViewMode('article')}
                                title="Maximize Article (1)"
                                className="absolute top-2.5 right-3 z-30 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/75 hover:bg-slate-900 text-white backdrop-blur-sm border border-white/15 shadow-md text-[11px] font-semibold transition-all cursor-pointer opacity-75 hover:opacity-100"
                            >
                                <Maximize2 size={12} />
                                <span>Maximize</span>
                            </button>
                        )}
                        {/* Clean Reader Mode Overlay */}
                        {isReaderMode && story.url && (
                            <div className="absolute inset-0 z-20 overflow-y-auto custom-scrollbar bg-[#faf9f6] dark:bg-[#131824] px-6 py-8 sm:px-10">
                                <article className="max-w-3xl mx-auto pb-20">
                                    <header className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
                                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight mb-3">
                                            {readerContent?.title || story.title}
                                        </h1>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                            <span>{(() => { try { return new URL(storyUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })()}</span>
                                            <span>·</span>
                                            <span>▲ {story.score} points</span>
                                            <span>·</span>
                                            <button
                                                onClick={() => switchViewMode('discussion')}
                                                className="text-orange-600 dark:text-orange-400 hover:underline font-semibold cursor-pointer"
                                            >
                                                {commentCount} comments →
                                            </button>
                                            <span>·</span>
                                            <button
                                                onClick={() => toggleReaderMode(false)}
                                                className="text-sky-600 dark:text-sky-400 hover:underline font-semibold cursor-pointer"
                                            >
                                                View original webpage
                                            </button>
                                        </div>
                                    </header>

                                    {readerLoading ? (
                                        <div className="py-16 flex flex-col items-center gap-3 text-slate-400">
                                            <RefreshCw size={22} className="animate-spin text-sky-500" />
                                            <span className="text-xs font-medium">Extracting clean article text...</span>
                                        </div>
                                    ) : readerError ? (
                                        <div className="py-12 text-center space-y-4">
                                            <p className="text-sm text-slate-500 dark:text-slate-400">{readerError}</p>
                                            <button
                                                onClick={() => toggleReaderMode(false)}
                                                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                                            >
                                                Switch to Live Web View
                                            </button>
                                        </div>
                                    ) : readerContent?.content_type === 'markdown' ? (
                                        <div className="prose prose-slate dark:prose-invert prose-base sm:prose-lg max-w-none leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800">
                                            <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                                {readerContent.content}
                                            </ReactMarkdown>
                                        </div>
                                    ) : readerContent?.content ? (
                                        <div
                                            className="prose prose-slate dark:prose-invert prose-base sm:prose-lg max-w-none leading-[1.75] prose-headings:font-bold prose-a:text-sky-600 dark:prose-a:text-sky-400 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-xl prose-img:rounded-xl"
                                            dangerouslySetInnerHTML={{ __html: sanitizeReaderHtml(readerContent.content) }}
                                        />
                                    ) : null}
                                </article>
                            </div>
                        )}

                        {!isActive ? (
                            <div className="w-full h-full bg-slate-50 dark:bg-[#131824]" />
                        ) : !isWebMode ? (
                            <webview
                                ref={articleWebviewRef}
                                src={storyUrl}
                                className="w-full h-full border-0 absolute inset-0 bg-white"
                                style={{ visibility: isReaderMode ? 'hidden' : 'visible' }}
                                title="Article Web View"
                            />
                        ) : iframeBlocked ? (
                            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-slate-50 dark:bg-[#131824]">
                                <div className="w-16 h-16 bg-red-100 dark:bg-red-950/20 rounded-full flex items-center justify-center mb-4">
                                    <ExternalLink size={32} className="text-red-500" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Iframe Preview Blocked</h3>
                                <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm text-sm">
                                    This website prohibits being nested in other apps. Please use the comments or AI summaries on other tabs, or open the link below.
                                </p>
                                <a href={storyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold shadow-lg shadow-orange-500/20 transition-all">
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
                )}
                                
                {/* Resizer Handle (Only in Split View) */}
                {isSplit && (
                    <div 
                        onMouseDown={startResizing}
                        className={`w-1 cursor-col-resize hover:bg-sky-500/40 transition-colors z-50 flex items-center justify-center group ${isResizing ? 'bg-sky-500' : 'bg-transparent'}`}
                    >
                        <div className="w-[1px] h-8 bg-slate-300 dark:bg-slate-700 group-hover:bg-sky-400"></div>
                    </div>
                )}

                <AISidebar
                    story={story}
                    isOpen={showSidePane}
                    isFullWidth={isSideFullWidth}
                    onToggleMaximize={() => switchViewMode(isSideFullWidth ? 'split' : (sidebarTab === 'ai' ? 'ai' : 'discussion'))}
                    onClose={() => switchViewMode('article')}
                    user={user}
                    onSetSummary={(summary, topics) => {
                        onSetSummary?.(story.id, summary, topics);
                    }}
                    onSetDiscussionSummary={(summary) => {
                        onSetDiscussionSummary?.(story.id, summary);
                    }}
                    onSummarizeStory={onSummarizeStory ? () => onSummarizeStory(story.id) : undefined}
                    comments={comments}
                    commentsLoading={commentsLoading}
                    refreshComments={refreshComments}
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
                    disabledTopics={disabledTopics}
                    setActiveTopics={setActiveTopics}
                    setDisabledTopics={setDisabledTopics}
                    topicMatch={topicMatch}
                />
            </div>

            {/* Mobile Bottom Navigation Bar */}
            {isMobileView && (
                <div className="flex items-center justify-around bg-white/95 dark:bg-[#0c1020]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800/80 px-4 py-2 shrink-0 z-50 shadow-2xl relative select-none">
                    <button
                        onClick={() => setMobileTab('article')}
                        className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 relative ${mobileTab === 'article' ? 'text-orange-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        <FileText size={18} />
                        <span className="text-[10px] tracking-wide">Article</span>
                        {mobileTab === 'article' && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-orange-500 rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setMobileTab('comments');
                            setSidebarTab('discussion');
                        }}
                        className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 relative ${mobileTab === 'comments' && sidebarTab === 'discussion' ? 'text-orange-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        <MessageSquare size={18} />
                        <span className="text-[10px] tracking-wide">Comments</span>
                        {mobileTab === 'comments' && sidebarTab === 'discussion' && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-orange-500 rounded-full" />
                        )}
                    </button>
                    <button
                        onClick={() => {
                            setMobileTab('ai');
                            setSidebarTab('ai');
                        }}
                        className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 relative ${mobileTab === 'ai' || (mobileTab === 'comments' && sidebarTab === 'ai') ? 'text-orange-500 font-bold scale-105' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    >
                        <Sparkles size={18} />
                        <span className="text-[10px] tracking-wide">AI</span>
                        {(mobileTab === 'ai' || (mobileTab === 'comments' && sidebarTab === 'ai')) && (
                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-1 bg-orange-500 rounded-full" />
                        )}
                    </button>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-800" />

                    {onToggleSave && (
                        <button
                            onClick={() => onToggleSave(story.id, !story.is_saved)}
                            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl transition-all duration-300 ${story.is_saved ? 'text-amber-500 scale-105' : 'text-slate-400 hover:text-amber-500'}`}
                        >
                            <Bookmark size={18} fill={story.is_saved ? "currentColor" : "none"} />
                            <span className="text-[10px] tracking-wide">{story.is_saved ? 'Saved' : 'Save'}</span>
                        </button>
                    )}
                    
                    <button
                        onClick={() => window.open(storyUrl, '_blank')}
                        className="flex flex-col items-center gap-1 py-1.5 px-3 rounded-2xl text-slate-400 hover:text-orange-500 transition-all duration-300"
                    >
                        <ExternalLink size={18} />
                        <span className="text-[10px] tracking-wide">Open</span>
                    </button>
                </div>
            )}
        </div>
    );
}
