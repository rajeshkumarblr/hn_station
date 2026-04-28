import React, { useState, useEffect } from 'react';
import { Check, RefreshCw, Sparkles, X, MessageSquare, Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import type { Story, User } from '../types';
import { getTagStyle } from '../utils/colors';
import { CommentList } from './CommentList';

const AI_COLORS = [
    'text-blue-500 dark:text-blue-400',
    'text-emerald-500 dark:text-emerald-400',
    'text-orange-500 dark:text-orange-400',
    'text-purple-500 dark:text-purple-400',
    'text-rose-500 dark:text-rose-400'
];

interface AISidebarProps {
    story: Story;
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSetSummary: (summary: string, topics: string[]) => void;
    onSetDiscussionSummary: (summary: string) => void;
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
    story, isOpen, onClose, user, onSetSummary, onSetDiscussionSummary,
    comments, commentsLoading, activeCommentId, onFocusComment,
    activeTab, onTabChange, containerRef, width = 480
}: AISidebarProps) {
    const [summarizing, setSummarizing] = useState(false);
    const [discussSummarizing, setDiscussSummarizing] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!story.summary) return;
        navigator.clipboard.writeText(story.summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        const handleKeys = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const selection = window.getSelection()?.toString();
                if (!selection && activeTab === 'summary' && story.summary) {
                    navigator.clipboard.writeText(story.summary);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            }
        };

        window.addEventListener('keydown', handleKeys);
        
        return () => {
            window.removeEventListener('keydown', handleKeys);
        };
    }, [story.id, story.url, activeTab]);
    useEffect(() => {
        // If we already have a summary, or the summary tab isn't active, do not poll
        if (story.summary || activeTab !== 'summary' || !isOpen) return;

        let isPolling = true;
        const pollSummary = async () => {
            try {
                const baseUrl = getApiBase();
                if (!baseUrl) return;
                
                const res = await fetchWithAuth(`${baseUrl}/api/stories/${story.id}`);
                if (!res.ok) return;
                
                const data = await res.json();
                if (data && data.story && data.story.summary && isPolling) {
                    onSetSummary(data.story.summary, data.story.topics || []);
                }
            } catch (err) {
                // Ignore network errors during polling
            }
        };

        const interval = setInterval(() => {
            if (isPolling) pollSummary();
        }, 5000);

        // Fire once immediately just in case the background worker literally just finished it
        pollSummary();

        return () => {
            isPolling = false;
            clearInterval(interval);
        };
    }, [story.id, story.summary, activeTab, isOpen, onSetSummary]);

    const handleSummarize = async () => {
        if (summarizing) return;
        setSummarizing(true);
        try {
            const baseUrl = getApiBase();
            const res = await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/summarize?force=true&priority=true`, {
                method: 'POST',
            });
            if (res.ok) {
                const data = await res.json();
                onSetSummary(data.story.summary, data.story.topics || []);
            }
        } catch (err) {
            console.error('Summarization failed:', err);
        } finally {
            setSummarizing(false);
        }
    };


    const handleSummarizeDiscussion = async () => {
        if (discussSummarizing) return;
        setDiscussSummarizing(true);
        try {
            const baseUrl = getApiBase();
            const res = await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/summarize/discussion`, {
                method: 'POST',
            });
            if (res.ok) {
                const data = await res.json();
                onSetDiscussionSummary(data.discussion_summary);
            }
        } catch (err) {
            console.error('Discussion summarization failed:', err);
        } finally {
            setDiscussSummarizing(false);
        }
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
                            <div className="pb-20 space-y-6">
                                {/* Discussion Summary Section */}
                                {story.discussion_summary ? (
                                    <div className="p-5 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-2xl border border-indigo-200 dark:border-indigo-500/20 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles size={14} className="text-indigo-500" />
                                            <h4 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Community Analysis</h4>
                                        </div>
                                        <div className="prose prose-slate dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                                            <ReactMarkdown
                                                components={{
                                                    li: ({node, ...props}) => (
                                                        <li className="flex gap-2 items-start mb-2">
                                                            <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-400 shrink-0" />
                                                            <span {...props} />
                                                        </li>
                                                    ),
                                                    ul: ({node, ...props}) => <ul className="pl-0 list-none" {...props} />,
                                                }}
                                            >
                                                {story.discussion_summary}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-center">
                                        <button 
                                            onClick={handleSummarizeDiscussion}
                                            disabled={discussSummarizing}
                                            className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold transition-all flex items-center gap-2 group border border-indigo-200/50 dark:border-indigo-500/20"
                                        >
                                            {discussSummarizing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} className="group-hover:scale-110 transition-transform" />}
                                            {discussSummarizing ? "Analyzing Discussion..." : "Summarize Discussion"}
                                        </button>
                                    </div>
                                )}

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
                            <div className="flex items-center justify-between mb-5 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/50 dark:border-white/5 shadow-sm">
                                <div className="flex flex-col">
                                    <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-0.5">Summary Engine</h3>
                                    <span className="text-[10px] font-bold text-blue-500 opacity-80">Refined UI (rc31)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        onClick={handleCopy}
                                        title="Copy Summary (Ctrl+C)"
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-white hover:bg-blue-600 transition-all border border-slate-300 dark:border-slate-700"
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? "Copied" : "Copy"}
                                    </button>
                                    <button 
                                        onClick={handleSummarize}
                                        disabled={summarizing}
                                        title="Regenerate for new 3-point format"
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-white hover:bg-amber-600 transition-all border border-slate-300 dark:border-slate-700 disabled:opacity-50"
                                    >
                                        <RefreshCw size={12} className={summarizing ? "animate-spin" : ""} />
                                        {summarizing ? "..." : "Regen"}
                                    </button>
                                </div>
                            </div>

                            
                            {/* Markdown Summary with Index-Based Colors */}
                            <div className="prose prose-slate dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-300 leading-relaxed font-sans select-text">
                                <ul className="pl-0 list-none m-0">
                                    {story.summary.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
                                        const colorClass = AI_COLORS[idx % AI_COLORS.length];
                                        const cleanLine = line.replace(/^[-*•]\s+/, '');
                                        return (
                                            <li key={idx} className={`${colorClass} flex gap-2 items-start mb-3 last:mb-0 marker:text-transparent`}>
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0 shadow-sm" />
                                                <div className="flex-1 text-slate-600 dark:text-slate-300">
                                                    <ReactMarkdown
                                                        components={{
                                                            p: ({ node, ...props }) => <span {...props} />,
                                                            strong: ({ node, ...props }) => <strong className="text-blue-500 font-bold dark:text-blue-400" {...props} />
                                                        }}
                                                    >
                                                        {cleanLine}
                                                    </ReactMarkdown>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>

                            {/* Tags - MOVED BELOW SUMMARY */}
                            {story.topics && story.topics.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-8 mb-6 animate-in fade-in slide-in-from-bottom-2">
                                    {story.topics.map(t => {
                                        const ts = getTagStyle(t);
                                        return (
                                            <span 
                                                key={t}
                                                className="px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-widest shadow-sm"
                                                style={{ backgroundColor: ts.bg, color: ts.color, borderColor: ts.border }}
                                            >
                                                #{t.replace(/\s+/g, '')}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Gemini View Container - Always Mounted to avoid reload */}
                <div className={`flex-1 flex flex-col relative bg-white dark:bg-slate-950 ${activeTab !== 'gemini' ? 'hidden' : ''}`}>
                    {/* Overlay Controls */}
                    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur-sm border border-slate-200 dark:border-white/5">Manual Chat Mode</span>
                    </div>

                    {/* Electron WebView Tag */}
                    {/* @ts-ignore */}
                    <webview 
                        src={story.gemini_url || "https://gemini.google.com"} 
                        className="flex-1 w-full h-full border-none"
                        style={{ background: 'white' }}
                    />
                </div>

            </div>
        </div>
    );
}
