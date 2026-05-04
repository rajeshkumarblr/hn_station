import React, { useState, useEffect, useRef } from 'react';
import { Check, RefreshCw, Sparkles, X, MessageSquare, Copy, ChevronRight } from 'lucide-react';
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
    activeTab: 'discussion' | 'gemini';
    onTabChange: (tab: 'discussion' | 'gemini') => void;
    containerRef?: React.RefObject<HTMLDivElement>;
    width?: number;
    isIngesting?: boolean;
    activeTopics?: string[];
}

interface ChatMessage {
    role: 'user' | 'assistant' | 'model';
    content: string;
}

export function AISidebar({ 
    story, isOpen, onClose, user, onSetSummary, onSetDiscussionSummary,
    comments, commentsLoading, isIngesting, activeCommentId, onFocusComment,
    activeTab, onTabChange, containerRef, width = 480, activeTopics = []
}: AISidebarProps) {
    const [summarizing, setSummarizing] = useState(false);
    const [discussSummarizing, setDiscussSummarizing] = useState(false);
    const [copied, setCopied] = useState(false);
    
    // Local Chat State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load chat history when story changes
    useEffect(() => {
        if (story.id && isOpen) {
            const baseUrl = getApiBase();
            fetchWithAuth(`${baseUrl}/api/stories/${story.id}/chat`)
                .then(res => res.ok ? res.json() : [])
                .then(data => {
                    const mapped = data.map((m: any) => ({
                        role: m.role === 'model' ? 'assistant' : m.role,
                        content: m.content
                    }));
                    setMessages(mapped);
                })
                .catch(err => console.error('Failed to load chat history', err));
        }
    }, [story.id, isOpen]);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || isChatLoading) return;

        const userMsg = chatInput.trim();
        setChatInput('');
        const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userMsg }];
        setMessages(newMessages);
        setIsChatLoading(true);

        try {
            const baseUrl = getApiBase();
            const streamUrl = `${baseUrl}/api/stories/${story.id}/chat/stream`;
            const res = await fetchWithAuth(streamUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg })
            });

            if (!res.ok) {
                const errText = await res.text();
                console.error('Stream start failed:', { status: res.status, url: streamUrl, response: errText });
                setMessages([...newMessages, { role: 'assistant', content: `Error (${res.status}) on ${streamUrl.split('/').pop()}: ${errText || 'Failed to start stream'}` }]);
                return;
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error('No reader');

            let assistantMsg = '';
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const chunk = line.slice(6);
                        if (chunk.startsWith('Error: ')) {
                            setMessages([...newMessages, { role: 'assistant', content: chunk }]);
                            return;
                        }
                        assistantMsg += chunk;
                        setMessages(prev => {
                            const last = prev[prev.length - 1];
                            if (last && last.role === 'assistant') {
                                return [...prev.slice(0, -1), { ...last, content: assistantMsg }];
                            }
                            return prev;
                        });
                    }
                }
            }
        } catch (err: any) {
            console.error('Chat failed:', err);
            setMessages([...newMessages, { role: 'assistant', content: `Connection error: ${err.message || 'Please ensure the backend is running.'}` }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleCopy = () => {
        if (!story.summary) return;
        navigator.clipboard.writeText(story.summary);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        // If we already have a summary, or the AI Assistant tab isn't active, do not poll
        if (story.summary || activeTab !== 'gemini' || !isOpen) return;

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
                        title="View community comments and analysis"
                        className={`flex items-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0 ${activeTab === 'discussion' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-slate-400 hover:text-slate-500'}`}
                    >
                        <MessageSquare size={14} /> <span className="font-black">Discussion</span>
                    </button>
                    <button 
                        onClick={() => onTabChange('gemini')}
                        title="Chat with local AI assistant (Privacy First)"
                        className={`flex items-center gap-2 px-4 py-3 text-[12px] font-black uppercase tracking-widest border-b-2 transition-all shrink-0 ${activeTab === 'gemini' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-500'}`}
                    >
                        <MessageSquare size={14} /> <span className="font-black">AI Assistant</span>
                    </button>
                </div>
                
                <div className="flex items-center gap-2 mr-2">
                    <button 
                        onClick={() => {
                            if (activeTab === 'gemini') {
                                setMessages([]);
                                setChatInput('');
                            }
                        }}
                        title={activeTab === 'gemini' ? "Clear Chat History" : "Refresh Tab"}
                        className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <button 
                        onClick={onClose}
                        className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-white/10 rounded-full text-slate-400 dark:text-slate-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
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
                        {((commentsLoading && comments.length === 0) || (isIngesting && comments.length === 0)) ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                                <RefreshCw size={24} className="animate-spin text-orange-500" />
                                <span className="animate-pulse font-medium text-[10px] uppercase tracking-widest">
                                    {isIngesting ? "Syncing from HN..." : "Loading discussion..."}
                                </span>
                            </div>
                        ) : (comments && comments.length > 0) || isIngesting ? (
                            <div className="pb-20 space-y-6">
                                {isIngesting && (
                                    <div className="flex items-center justify-center gap-2 py-2 px-4 bg-orange-500/10 border border-orange-500/20 rounded-xl animate-pulse">
                                        <RefreshCw size={12} className="animate-spin text-orange-500" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 dark:text-orange-400">Updating discussion from Hacker News...</span>
                                    </div>
                                )}
                                
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
                                <p className="text-[10px] mt-2 opacity-60 italic">Refreshing may trigger a sync if this is an old story.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Local AI Assistant Tab Content */}
                <div className={`flex-1 flex flex-col min-h-0 relative bg-white dark:bg-[#0f172a] ${activeTab !== 'gemini' ? 'hidden' : ''}`}>
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar space-y-6 min-h-0">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-40 px-10 gap-4">
                                <div className="p-4 rounded-full bg-indigo-500/10 text-indigo-500">
                                    <MessageSquare size={32} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold uppercase tracking-widest mb-2">Local AI Assistant</h3>
                                    <p className="text-xs leading-relaxed mb-6">
                                        Ask me anything about this story or the discussion below. 
                                        I have full context of the article and top comments.
                                    </p>
                                    
                                    <div className="flex flex-col gap-3">
                                        <button 
                                            onClick={() => {
                                                if (story.summary) {
                                                    setMessages([{ role: 'assistant', content: `### Article Summary\n\n${story.summary}` }]);
                                                } else {
                                                    handleSummarize().then(() => {
                                                        // Note: summary might not be updated in the state yet due to async
                                                        setMessages([{ role: 'assistant', content: "Generating summary... please ask again in a moment or wait for the automatic update." }]);
                                                    });
                                                }
                                            }}
                                            className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-500/20"
                                        >
                                            <Sparkles size={14} /> View Article Summary
                                        </button>
                                        <button 
                                            onClick={() => setChatInput("What is the main takeaway from the comments?")}
                                            className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-white/10"
                                        >
                                            <MessageSquare size={14} /> Analyze Comments
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-indigo-600 text-white rounded-tr-none ml-auto' 
                                            : 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/50 rounded-tl-none mr-auto'
                                    }`}>
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed break-words overflow-x-hidden">
                                            <ReactMarkdown>
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        {isChatLoading && (
                            <div className="flex justify-start animate-pulse">
                                <div className="bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                        <form onSubmit={(e) => handleSendMessage(e)} className="relative flex items-center">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Message local assistant..."
                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-12 py-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all shadow-inner"
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isChatLoading}
                                className="absolute right-2 p-2 rounded-lg bg-indigo-600 text-white disabled:opacity-30 disabled:bg-slate-400 transition-all"
                            >
                                <ChevronRight size={18} />
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
