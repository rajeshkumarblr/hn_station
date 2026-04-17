import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Sparkles, Send, Trash2, RefreshCw, Bot, User as UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import type { Story, ChatMessage, User } from '../types';
import { getTagStyle } from './StoryCard';
import { CommentList } from './CommentList';

interface AISidebarProps {
    story: Story;
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSetSummary: (summary: string, topics: string[]) => void;
    comments: any[];
    commentsLoading: boolean;
    activeCommentId?: string | null;
    onFocusComment?: (id: string) => void;
    activeTab: 'discussion' | 'summary' | 'gemini';
    onTabChange: (tab: 'discussion' | 'summary' | 'gemini') => void;
    containerRef?: React.RefObject<HTMLDivElement>;
    width?: number;
}

export function AISidebar({ 
    story, isOpen, onClose, user, onSetSummary, 
    comments, commentsLoading, activeCommentId, onFocusComment,
    activeTab, onTabChange, containerRef, width = 480
}: AISidebarProps) {
    const [summarizing, setSummarizing] = useState(false);
    const [contextInjected, setContextInjected] = useState(false);
    const webviewRef = useRef<any>(null);

    // Track Gemini URL changes to persist threads
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const handleNav = (e: any) => {
            const url = e.url;
            if (url.includes('gemini.google.com/app/')) {
                saveGeminiURL(url);
            }
        };

        const handleReady = () => {
            // 1. Implicit Injection for fresh discussions
            if (!story.gemini_url || story.gemini_url === "https://gemini.google.com") {
                const context = `HN Article: ${story.url}`;
                const script = `
                    (function() {
                        const editor = document.querySelector('div.ql-editor');
                        if (editor && !editor.textContent.trim()) {
                            editor.textContent = "${context}\\n";
                            editor.dispatchEvent(new Event('input', { bubbles: true }));
                            editor.focus();
                        }
                    })();
                `;
                webview.executeJavaScript(script);
            }
            
            // 2. Auto-scroll to bottom when loading existing thread
            const scrollScript = `
                (function() {
                    const scroller = document.querySelector('infinite-scroller.chat-history') || document.querySelector('div.chat-history');
                    if (scroller) {
                        scroller.scrollTop = scroller.scrollHeight;
                        // Sometimes content is late, try again after a small delay
                        setTimeout(() => { scroller.scrollTop = scroller.scrollHeight; }, 1000);
                    }
                })();
            `;
            webview.executeJavaScript(scrollScript);
        };

        webview.addEventListener('did-navigate-in-page', handleNav);
        webview.addEventListener('did-navigate', handleNav);
        webview.addEventListener('dom-ready', handleReady);
        
        return () => {
            webview.removeEventListener('did-navigate-in-page', handleNav);
            webview.removeEventListener('did-navigate', handleNav);
            webview.removeEventListener('dom-ready', handleReady);
        };
    }, [story.id, activeTab]);

    const saveGeminiURL = async (url: string) => {
        try {
            const baseUrl = getApiBase();
            await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/gemini_url`, {
                method: 'PATCH',
                body: JSON.stringify({ url }),
            });
        } catch (err) {
            console.error('Failed to save gemini url:', err);
        }
    };

    const handleSummarize = async () => {
        if (summarizing) return;
        setSummarizing(true);
        try {
            const baseUrl = getApiBase();
            const res = await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/summarize`, {
                method: 'POST',
            });
            if (res.ok) {
                const data = await res.json();
                onSetSummary(data.summary, data.topics || []);
            }
        } catch (err) {
            console.error('Summarization failed:', err);
        } finally {
            setSummarizing(false);
        }
    };

    const injectGeminiSummary = () => {
        const webview = webviewRef.current;
        if (!webview) return;
        
        const context = `Please summarize this article: ${story.url}`;
        const script = `
            (function() {
                const editor = document.querySelector('div.ql-editor');
                if (editor) {
                    editor.textContent = "${context}";
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                    editor.focus();
                    
                    // Try to find and click the send button
                    setTimeout(() => {
                        const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                                        document.querySelector('button.send-button');
                        if (sendBtn) sendBtn.click();
                    }, 500);
                }
            })();
        `;
        webview.executeJavaScript(script);
    };

    const aiEnabled = user?.ai_summaries_enabled || false;

    return (
        <div 
            className="h-full flex flex-col bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-xl border-l border-slate-200 dark:border-white/10 shadow-2xl relative"
            style={{ 
                display: isOpen ? 'flex' : 'none',
                width: `${width}px`,
                minWidth: `${width}px` // Ensure it doesn't shrink under flex
            }}
        >
            {/* Header / Tabs Unified */}
            <div className="flex items-center justify-between px-2 bg-slate-50/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <div className="flex flex-1 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => onTabChange('discussion')}
                        className={`flex items-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0 ${activeTab === 'discussion' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-400 hover:text-slate-500'}`}
                    >
                        <MessageSquare size={14} /> <span className="font-black">Discussion</span>
                    </button>
                    <button 
                        onClick={() => onTabChange('gemini')}
                        className={`flex items-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0 ${activeTab === 'gemini' ? 'border-[#4285F4] text-[#4285F4]' : 'border-transparent text-slate-400 hover:text-slate-500'}`}
                    >
                        <div className="w-4 h-4 rounded-full bg-[#4285F4] flex items-center justify-center text-[10px] text-white font-bold">G</div> <span className="font-black">Gemini Chat</span>
                    </button>
                    <button 
                        onClick={() => onTabChange('summary')}
                        className={`flex items-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0 ${activeTab === 'summary' ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-500'}`}
                    >
                        <Sparkles size={14} /> <span className="font-black">Summary</span>
                    </button>
                </div>
                
                <button 
                    onClick={onClose}
                    className="p-1.5 mr-2 hover:bg-slate-200/50 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Content Container */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-white dark:bg-[#0f172a]">
                
                {/* Discussion Tab Content */}
                <div 
                    ref={containerRef}
                    className={`flex-1 flex flex-col relative overflow-hidden focus:outline-none ${activeTab !== 'discussion' ? 'hidden' : ''}`}
                    tabIndex={-1}
                >
                    <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                        {commentsLoading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                                <RefreshCw size={24} className="animate-spin text-orange-500" />
                                <span className="animate-pulse font-medium text-xs uppercase tracking-widest">Loading HN discussion...</span>
                            </div>
                        ) : comments && comments.length > 0 ? (
                            <div className="pb-20">
                                <CommentList
                                    comments={comments}
                                    parentId={null}
                                    activeCommentId={activeCommentId}
                                    onFocusComment={onFocusComment}
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
                                <MessageSquare size={48} className="text-slate-300 dark:text-slate-700 mb-4" />
                                <p className="text-sm font-bold uppercase tracking-widest">No comments yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Summary View Container */}
                <div className={`flex-1 overflow-y-auto px-6 py-4 custom-scrollbar ${activeTab !== 'summary' ? 'hidden' : ''}`}>
                    {!story.summary ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <Sparkles size={48} className="text-slate-200 dark:text-slate-800 mb-4" />
                            {aiEnabled ? (
                                <>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">No summary generated yet.</p>
                                    <button 
                                        onClick={handleSummarize}
                                        disabled={summarizing}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {summarizing ? <RefreshCw size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                        {summarizing ? "Analyzing..." : "Generate Summary"}
                                    </button>
                                </>
                            ) : (
                                <p className="text-sm text-slate-500 dark:text-slate-400">AI Summaries are disabled in settings.</p>
                            )}
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2">
                            {/* Tags */}
                            {story.topics && story.topics.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-6">
                                    {story.topics.map(t => {
                                        const ts = getTagStyle(t);
                                        return (
                                            <span 
                                                key={t}
                                                className="px-2 py-1 rounded-md text-[10px] font-black border uppercase tracking-wider"
                                                style={{ backgroundColor: ts.bg, color: ts.color, borderColor: ts.border }}
                                            >
                                                #{t.replace(/\s+/g, '')}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                            
                            {/* Markdown Summary */}
                            <div className="prose prose-slate dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                                <ReactMarkdown
                                    components={{
                                        li: ({node, ...props}) => (
                                            <li className="flex gap-2 items-start mb-2">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 shadow-sm shadow-blue-500/50" />
                                                <span {...props} />
                                            </li>
                                        ),
                                        ul: ({node, ...props}) => <ul className="pl-0 list-none" {...props} />,
                                        p: ({node, ...props}) => <p className="mb-4" {...props} />,
                                        strong: ({node, ...props}) => <strong className="text-blue-500 font-bold dark:text-blue-400" {...props} />
                                    }}
                                >
                                    {story.summary}
                                </ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>

                {/* Gemini View Container - Always Mounted to avoid reload */}
                <div className={`flex-1 flex flex-col relative bg-white dark:bg-slate-950 ${activeTab !== 'gemini' ? 'hidden' : ''}`}>
                    {/* Overlay Controls */}
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur-sm border border-slate-200 dark:border-white/5">Live Chat</span>
                    </div>

                    {/* Electron WebView Tag */}
                    {/* @ts-ignore */}
                    <webview 
                        ref={webviewRef}
                        src={story.gemini_url || "https://gemini.google.com"} 
                        className="flex-1 w-full h-full border-none"
                        style={{ background: 'white' }}
                    />
                </div>
            </div>
        </div>
    );
}
