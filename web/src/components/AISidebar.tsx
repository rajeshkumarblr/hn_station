import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Sparkles, X, MessageSquare, ChevronRight, Copy, Check, Zap, AlertCircle, Plus, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import { isWebPreview } from '../utils/env';
import { getClientAISettings, clientGenerateChatResponse } from '../utils/aiClient';
import type { Story, User } from '../types';
import { CommentList } from './CommentList';
import { getTagStyle } from '../utils/colors';

interface AISidebarProps {
    story: Story;
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
    onSetSummary: (summary: string, topics: string[]) => void;
    onSetDiscussionSummary: (summary: string) => void;
    comments: any[];
    commentsLoading: boolean;
    refreshComments?: () => void;
    activeCommentId?: string | null;
    onFocusComment?: (id: string) => void;
    activeTab: 'discussion' | 'summary' | 'ai';
    onTabChange: (tab: 'discussion' | 'summary' | 'ai') => void;
    containerRef?: React.RefObject<HTMLDivElement>;
    width?: number;
    isFullWidth?: boolean;
    onToggleMaximize?: () => void;
    isIngesting?: boolean;
    activeTopics?: string[];
    disabledTopics?: string[];
    setActiveTopics?: React.Dispatch<React.SetStateAction<string[]>>;
    setDisabledTopics?: React.Dispatch<React.SetStateAction<string[]>>;
    topicMatch?: 'any' | 'all' | 'exclusive';
    onSummarizeStory?: () => Promise<any> | undefined;
}

import rehypeHighlight from 'rehype-highlight';

interface ChatMessage {
    role: 'user' | 'assistant' | 'model';
    content: string;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={`p-1.5 rounded-md transition-all border flex items-center justify-center ${
                copied 
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' 
                : 'bg-white/10 border-white/10 hover:bg-white/20 text-slate-400 hover:text-white'
            }`}
            title={copied ? "Copied!" : "Copy to clipboard"}
        >
            {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
    );
}

export function AISidebar({ 
    story, isOpen, onClose, onSetSummary, onSetDiscussionSummary,
    comments, commentsLoading, refreshComments, isIngesting, activeCommentId, onFocusComment,
    activeTab, onTabChange, containerRef, width = 480, isFullWidth = false, onToggleMaximize,
    activeTopics = [], disabledTopics = [], setActiveTopics, setDisabledTopics, topicMatch = 'any',
    onSummarizeStory
}: AISidebarProps) {
    const [discussSummarizing, setDiscussSummarizing] = useState(false);
    const [showCommentComposer, setShowCommentComposer] = useState(false);
    
    // Local Chat State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Top-level comment submission state
    const [topCommentText, setTopCommentText] = useState('');
    const [topCommentSubmitting, setTopCommentSubmitting] = useState(false);
    const [topCommentError, setTopCommentError] = useState<string | null>(null);

    const handleTopCommentSubmit = async () => {
        if (!topCommentText.trim() || topCommentSubmitting) return;

        const hnUsername = localStorage.getItem('hn_username');
        const hnPassword = localStorage.getItem('hn_password');

        if (!hnUsername || !hnPassword) {
            setTopCommentError("Please set HN login in settings");
            return;
        }

        setTopCommentSubmitting(true);
        setTopCommentError(null);

        try {
            const res = await fetch(`${getApiBase()}/api/hn/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: hnUsername,
                    password: hnPassword,
                    action: 'comment',
                    item_id: story.id,
                    text: topCommentText
                })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to post comment');
            }

            setTopCommentText('');
            setShowCommentComposer(false);
            if (refreshComments) {
                refreshComments();
            }
        } catch (err: any) {
            setTopCommentError(err.message || 'Error posting comment');
        } finally {
            setTopCommentSubmitting(false);
        }
    };

    // Load chat history when story changes
    useEffect(() => {
        const baseUrl = getApiBase();
        if (story.id && isOpen && baseUrl) {
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
    }, [story.id, isOpen, getApiBase()]);

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
            const isWeb = isWebPreview();
            const aiSettings = getClientAISettings();

            if (isWeb && aiSettings.provider !== 'disabled') {
                try {
                    const baseUrl = getApiBase();
                    // 1. Fetch article text content
                    const contentRes = await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/content`).catch(() => null);
                    const contentData = contentRes && contentRes.ok ? await contentRes.json().catch(() => ({})) : {};
                    const articleText = contentData.content || "";

                    // 2. Concatenate comments context
                    const commentsText = (comments || []).slice(0, 100).map(c => `${c.by}: ${c.text}`).join('\n\n');
                    const storyContext = `Story Title: ${story.title}\nStory URL: ${story.url}\n\nArticle Body:\n${articleText}\n\nUser Comments Discussion:\n${commentsText}`;

                    // 3. Map history
                    const history = messages.map(m => ({
                        role: m.role === 'model' ? 'assistant' as const : m.role as 'user' | 'assistant',
                        content: m.content
                    }));

                    // 4. Generate reply
                    const reply = await clientGenerateChatResponse(storyContext, history, userMsg);
                    
                    setMessages([...newMessages, { role: 'assistant', content: reply }]);
                } catch (clientErr: any) {
                    console.error('[AISidebar] Client Chat Error:', clientErr);
                    setMessages([...newMessages, { role: 'assistant', content: `Chat failed: ${clientErr.message || 'Please check your API key and network connection.'}` }]);
                } finally {
                    setIsChatLoading(false);
                }
                return;
            }

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
                setIsChatLoading(false);
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
                        const b64 = line.slice(6).trim();
                        if (!b64) continue;
                        
                        let chunk = '';
                        try {
                            // Decode base64 to UTF-8 string
                            chunk = decodeURIComponent(escape(window.atob(b64)));
                        } catch (e) {
                            console.error('Failed to decode chunk', b64, e);
                            continue;
                        }

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


    useEffect(() => {
        // If we already have a summary, or the AI Assistant tab isn't active, do not poll
        if (story.summary || activeTab !== 'ai' || !isOpen) return;

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

        let attempts = 0;
        const interval = setInterval(() => {
            if (!isPolling || document.hidden) return;
            attempts++;
            if (attempts > 6) {
                clearInterval(interval);
                return;
            }
            pollSummary();
        }, 10000);

        // Fire once immediately just in case the background worker literally just finished it
        pollSummary();

        return () => {
            isPolling = false;
            clearInterval(interval);
        };
    }, [story.id, story.summary, activeTab, isOpen, onSetSummary]);



    const handleSummarizeDiscussion = async () => {
        if (discussSummarizing) return;
        setDiscussSummarizing(true);
        const isWeb = isWebPreview();
        const aiSettings = getClientAISettings();

        if (isWeb && aiSettings.provider !== 'disabled') {
            try {
                const commentsText = (comments || []).slice(0, 100).map(c => `${c.by}: ${c.text}`).join('\n\n');
                const prompt = `You are summarizing the Hacker News comment discussion for the story "${story.title}".
Here is the raw text of the comment thread:
---
${commentsText.length > 15000 ? commentsText.substring(0, 15000) + '... [truncated]' : commentsText}
---
Please generate a cohesive, insightful 3-paragraph summary of the main arguments, tech discussions, consensus, and interesting debates from the community. Use clear markdown formatting.`;

                let discussionSummary = '';
                if (aiSettings.provider === 'gemini') {
                    const geminiModel = aiSettings.model || 'gemini-2.5-flash';
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${aiSettings.apiKey}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                    });
                    if (!res.ok) throw new Error(`Gemini failed: ${res.status}`);
                    const data = await res.json();
                    discussionSummary = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                } else if (aiSettings.provider === 'openai') {
                    const openAIModel = aiSettings.model || 'gpt-4o-mini';
                    const url = 'https://api.openai.com/v1/chat/completions';
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiSettings.apiKey}` },
                        body: JSON.stringify({
                            model: openAIModel,
                            messages: [{ role: 'user', content: prompt }]
                        })
                    });
                    if (!res.ok) throw new Error(`OpenAI failed: ${res.status}`);
                    const data = await res.json();
                    discussionSummary = data.choices?.[0]?.message?.content || '';
                } else if (aiSettings.provider === 'ollama') {
                    const cleanBase = (aiSettings.ollamaUrl || 'http://localhost:9379').replace(/\/+$/, '').replace(/\/v1$/, '');
                    const ollamaModel = aiSettings.model || 'gemma4-e2b-hw-int4-20260622';
                    const res = await fetch(`${cleanBase}/v1/chat/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: `${ollamaModel},,4096`,
                            messages: [{ role: 'user', content: prompt }],
                            stream: false
                        })
                    });
                    if (!res.ok) throw new Error(`LiteRT-LM failed: ${res.status}`);
                    const data = await res.json();
                    discussionSummary = data.choices?.[0]?.message?.content || data.response || '';
                } else if (aiSettings.provider === 'server-granite') {
                    const res = await fetchWithAuth(`${getApiBase()}/api/ai/proxy/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: 'granite3.1-dense:2b', prompt: prompt, stream: false })
                    });
                    if (!res.ok) throw new Error(`Server AI failed: ${res.status}`);
                    const data = await res.json();
                    discussionSummary = data.response || '';
                }

                if (discussionSummary) {
                    const baseUrl = getApiBase();
                    // Patch to save discussion summary globally in database
                    await fetchWithAuth(`${baseUrl}/api/stories/${story.id}/summary`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ discussion_summary: discussionSummary })
                    }).catch(() => {});
                    
                    onSetDiscussionSummary(discussionSummary);
                }
            } catch (err: any) {
                console.error('Client Discussion summarization failed:', err);
                alert(err.message || 'Client Discussion summarization failed');
            } finally {
                setDiscussSummarizing(false);
            }
            return;
        }

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


    // Collapse comment composer when switching stories
    useEffect(() => {
        setShowCommentComposer(false);
        setTopCommentText('');
        setTopCommentError(null);
    }, [story.id]);

    return (
        <div 
            className={`h-full flex flex-col bg-white dark:bg-[#131824] relative transition-all duration-200 ${isFullWidth ? '' : 'border-l border-slate-200 dark:border-slate-800/90 shadow-xl'}`}
            style={(isFullWidth || isWebPreview() || (typeof window !== 'undefined' && window.innerWidth < 768)) ? {
                display: isOpen ? 'flex' : 'none',
                width: '100%',
                minWidth: '100%',
                flex: 1
            } : { 
                display: isOpen ? 'flex' : 'none',
                width: `${width}px`,
                minWidth: `${width}px` 
            }}
        >
            {/* Slim Split-Only Header (hidden in full-width mode since the top toolbar already switches tabs) */}
            {!isFullWidth && (!isWebPreview() || (typeof window !== 'undefined' && window.innerWidth < 768)) && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-[#161d2e] border-b border-slate-200 dark:border-slate-800/90 shrink-0">
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => onTabChange('discussion')}
                            title="View community comments"
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${activeTab === 'discussion' ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <MessageSquare size={12} /> <span>Discussion</span>
                        </button>
                        <button 
                            onClick={() => onTabChange('ai')}
                            title="AI Summary & Chat"
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${activeTab === 'ai' ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <Sparkles size={12} /> <span>AI</span>
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        {activeTab === 'ai' && (
                            <button 
                                onClick={() => { setMessages([]); setChatInput(''); }}
                                title="Clear Chat History"
                                className="p-1 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                            >
                                <RefreshCw size={13} />
                            </button>
                        )}
                        {!(typeof window !== 'undefined' && window.innerWidth < 768) && (
                            <>
                                {onToggleMaximize && (
                                    <button 
                                        onClick={onToggleMaximize}
                                        title="Maximize Discussion / AI pane"
                                        className="flex items-center gap-1 px-2 py-1 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md text-[11px] font-semibold text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                        <Maximize2 size={12} />
                                        <span>Maximize</span>
                                    </button>
                                )}
                                <button 
                                    onClick={onClose}
                                    title="Hide pane (Maximize Article)"
                                    className="p-1 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Content Container */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-white dark:bg-[#131824]">

                {/* Discussion Tab Content */}
                <div 
                    ref={containerRef}
                    className={`flex-1 flex flex-col relative overflow-hidden focus:outline-none ${activeTab !== 'discussion' ? 'hidden' : ''}`}
                    tabIndex={-1}
                >
                    <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
                        <div className={isFullWidth ? 'max-w-3xl mx-auto' : ''}>
                            {/* Compact Discussion Action Bar (replaces permanent Post a Comment box & giant button) */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-slate-200/80 dark:border-slate-800/80">
                                <div className="min-w-0">
                                    {isFullWidth && (
                                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug mb-0.5 truncate">
                                            {story.title}
                                        </h2>
                                    )}
                                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            {comments.length > 0 ? `${comments.length} comments` : `${story.descendants || 0} comments`}
                                        </span>
                                        {refreshComments && (
                                            <button
                                                onClick={refreshComments}
                                                title="Refresh comments"
                                                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                            >
                                                <RefreshCw size={12} className={commentsLoading ? 'animate-spin text-orange-500' : ''} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {!isWebPreview() && !story.discussion_summary && comments.length > 0 && (
                                        <button 
                                            onClick={handleSummarizeDiscussion}
                                            disabled={discussSummarizing}
                                            className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1.5 border border-indigo-500/20 cursor-pointer disabled:opacity-50"
                                        >
                                            {discussSummarizing ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            <span>{discussSummarizing ? 'Summarizing...' : 'Summarize'}</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowCommentComposer(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 border cursor-pointer ${
                                            showCommentComposer
                                                ? 'bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30'
                                                : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/80'
                                        }`}
                                    >
                                        <Plus size={12} className={showCommentComposer ? 'rotate-45 transition-transform' : 'transition-transform'} />
                                        <span>{showCommentComposer ? 'Cancel' : 'Comment'}</span>
                                    </button>

                                    {isFullWidth && onToggleMaximize && (
                                        <button
                                            onClick={onToggleMaximize}
                                            title="Restore Side-by-Side Split View"
                                            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 border bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/80 cursor-pointer"
                                        >
                                            <Minimize2 size={12} />
                                            <span>Split</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Collapsible Comment Composer — only shown when user explicitly clicks + Comment */}
                            {showCommentComposer && (
                                <div className="mb-5 p-3.5 bg-slate-50 dark:bg-[#1a2234] rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col gap-2.5">
                                    <textarea
                                        value={topCommentText}
                                        onChange={(e) => setTopCommentText(e.target.value)}
                                        placeholder="Add to the HN discussion..."
                                        rows={3}
                                        autoFocus
                                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131824] text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-orange-500/25 focus:border-orange-500/80 outline-none resize-none"
                                    />
                                    {topCommentError && (
                                        <div className="text-[11px] text-red-500 font-semibold flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            {topCommentError}
                                        </div>
                                    )}
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => { setShowCommentComposer(false); setTopCommentError(null); }}
                                            className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleTopCommentSubmit}
                                            disabled={topCommentSubmitting || !topCommentText.trim()}
                                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                                        >
                                            {topCommentSubmitting ? 'Posting...' : 'Post Comment'}
                                        </button>
                                    </div>
                                </div>
                            )}

                        {((commentsLoading && comments.length === 0) || (isIngesting && comments.length === 0)) ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                                <RefreshCw size={22} className="animate-spin text-orange-500" />
                                <span className="font-medium text-xs">
                                    {isIngesting ? "Syncing discussion from HN..." : "Loading discussion..."}
                                </span>
                            </div>
                        ) : (comments && comments.length > 0) || isIngesting ? (
                            <div className="pb-16 space-y-5">

                                {/* Discussion Summary Card (only shown when generated) */}
                                {!isWebPreview() && story.discussion_summary && (
                                    <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-xl border border-indigo-200/80 dark:border-indigo-500/20">
                                        <div className="flex items-center gap-1.5 mb-2.5">
                                            <Sparkles size={13} className="text-indigo-500" />
                                            <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Discussion Summary</h4>
                                        </div>
                                        <div className="prose prose-slate dark:prose-invert prose-sm max-w-none text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                                            <ReactMarkdown
                                                components={{
                                                    li: ({node, ...props}) => {
                                                        const rawText = node?.children?.map((c: any) => c.value || c.children?.[0]?.value || '').join('') || '';
                                                        const isNumbered = /^\s*\d+\./.test(rawText);
                                                        return (
                                                            <li className="flex gap-2.5 items-start mb-2">
                                                                {!isNumbered && (
                                                                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                                                )}
                                                                <span className="flex-1 m-0 p-0" {...props} />
                                                            </li>
                                                        );
                                                    },
                                                    ul: ({node, ...props}) => <ul className="pl-0 list-none" {...props} />,
                                                }}
                                            >
                                                {story.discussion_summary}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                )}

                                <CommentList
                                    comments={comments}
                                    parentId={null}
                                    activeCommentId={activeCommentId}
                                    onFocusComment={onFocusComment}
                                    refreshComments={refreshComments}
                                />

                                {/* Article Specific Topics (Suggested) - Moved from Header */}
                                {story.topics && story.topics.length > 0 && setActiveTopics && setDisabledTopics && (
                                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center gap-1.5 mb-4">
                                            <Zap size={11} className="text-amber-500" />
                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Article Topics</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {story.topics.map(topic => {
                                                const isPresent = activeTopics.includes(topic);
                                                const isEnabled = isPresent && !disabledTopics.includes(topic);
                                                const style = getTagStyle(topic);
                                                return (
                                                    <button
                                                        key={`article-topic-${topic}`}
                                                        onClick={() => {
                                                            if (!isPresent) {
                                                                // Add new chip
                                                                setActiveTopics(prev => [...new Set([...prev, topic])]);
                                                                if (topicMatch === 'exclusive') {
                                                                    // In exclusive mode, disable all existing topics
                                                                    setDisabledTopics([...activeTopics]);
                                                                } else {
                                                                    // In other modes, ensure the new chip is enabled
                                                                    setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                                }
                                                            } else {
                                                                // Chip is already present, toggle enabled state
                                                                if (isEnabled) {
                                                                    setDisabledTopics(prev => [...new Set([...prev, topic])]);
                                                                } else {
                                                                    if (topicMatch === 'exclusive') {
                                                                        // Enable ONLY this one
                                                                        setDisabledTopics(activeTopics.filter(x => x !== topic));
                                                                    } else {
                                                                        setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border shadow-sm ${isEnabled 
                                                            ? 'scale-105 ring-1 ring-offset-1 dark:ring-offset-slate-950 shadow-md opacity-100' 
                                                            : 'opacity-50 hover:opacity-100 hover:scale-105 bg-white/5 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50'}`}
                                                        style={{ 
                                                            backgroundColor: style.bg, 
                                                            color: style.color, 
                                                            borderColor: isEnabled ? style.color : style.border
                                                        }}
                                                    >
                                                        {isEnabled ? '✓ ' : '#'}{topic}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-6 text-slate-300 dark:text-slate-700">
                                    <MessageSquare size={32} />
                                </div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-2">No comments yet</h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-relaxed max-w-[200px] mb-8">
                                    Hacker News might have discussion for this story that hasn't been synced yet.
                                </p>
                                
                                {story.descendants > 0 && (
                                    <button
                                        onClick={async () => {
                                            const baseUrl = getApiBase();
                                            // Calling the story details endpoint triggers a sync if comments are missing
                                            await fetchWithAuth(`${baseUrl}/api/stories/${story.id}`);
                                            // The ReaderPane parent component will handle the polling via isIngesting state
                                            window.location.reload(); // Quickest way to trigger parent refresh
                                        }}
                                        className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 active:scale-95"
                                    >
                                        Sync {story.descendants} Comments
                                    </button>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                {/* Local AI Assistant Tab Content */}
                <div className={`flex-1 flex flex-col min-h-0 relative bg-white dark:bg-[#131824] ${activeTab !== 'ai' ? 'hidden' : ''}`}>
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar min-h-0">
                        <div className={`space-y-6 ${isFullWidth ? 'max-w-3xl mx-auto' : ''}`}>
                        {messages.length === 0 ? (
                            <div className="py-6 space-y-5">
                                {isFullWidth && (
                                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                        {story.title}
                                    </h2>
                                )}
                                {story.summary ? (
                                    <div className="p-5 rounded-xl bg-slate-50 dark:bg-[#1a2234] border border-slate-200 dark:border-slate-700/80">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles size={14} className="text-amber-500" />
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Article Summary</h3>
                                        </div>
                                        <ul className="space-y-2.5">
                                            {story.summary.split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).map((line, i) => (
                                                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                                                    <span>{line}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#1a2234] border border-slate-200 dark:border-slate-700/80 flex flex-col items-center text-center gap-3">
                                        <Sparkles size={22} className="text-indigo-500" />
                                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                                            Generate a quick summary of this article or ask questions below using your local AI model.
                                        </p>
                                        <button 
                                            onClick={async () => {
                                                if (onSummarizeStory) {
                                                    const res = await onSummarizeStory();
                                                    if (res && res.summary) {
                                                        setMessages([{ role: 'assistant', content: `### Article Summary\n\n${res.summary}` }]);
                                                    }
                                                }
                                            }}
                                            className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Sparkles size={13} /> Summarize Article
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button 
                                        onClick={() => setChatInput("What are the key technical takeaways from this article?")}
                                        className="px-3 py-1.5 bg-slate-100 dark:bg-[#1a2234] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-200 dark:border-slate-700/80 cursor-pointer"
                                    >
                                        Key technical takeaways?
                                    </button>
                                    <button 
                                        onClick={() => setChatInput("What is the main consensus and pushback in the HN comments?")}
                                        className="px-3 py-1.5 bg-slate-100 dark:bg-[#1a2234] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-200 dark:border-slate-700/80 cursor-pointer"
                                    >
                                        Main consensus & pushback in comments?
                                    </button>
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
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed break-words overflow-x-hidden select-text prose-code:before:content-none prose-code:after:content-none">
                                            <ReactMarkdown
                                                rehypePlugins={[rehypeHighlight]}
                                                components={{
                                                    pre: ({ children }) => <>{children}</>,
                                                    code({ node, inline, className, children, ...props }: any) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const codeString = String(children).replace(/\n$/, '');
                                                        
                                                        // Code Block (with or without language)
                                                        if (!inline && (match || codeString.includes('\n'))) {
                                                            const lang = match ? match[1] : 'code';
                                                            return (
                                                                <div className="my-3 rounded-lg border border-slate-300/50 dark:border-white/10 overflow-hidden bg-slate-950/50 dark:bg-black/40 shadow-sm">
                                                                    <div className="flex items-center justify-between px-3 py-1 bg-slate-200/50 dark:bg-white/5 border-b border-slate-300/50 dark:border-white/10">
                                                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                                                            {lang}
                                                                        </span>
                                                                        <CopyButton text={codeString} />
                                                                    </div>
                                                                    <code className={`${className} block p-3.5 overflow-x-auto custom-scrollbar font-mono text-[13px] leading-relaxed text-slate-200`} {...props}>
                                                                        {children}
                                                                    </code>
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        // Inline Code
                                                        return (
                                                            <code className="bg-slate-200/60 dark:bg-slate-700/40 px-1.5 py-0.5 rounded-md text-indigo-600 dark:text-indigo-300 font-mono text-[0.9em] border border-slate-300/50 dark:border-slate-600/30" {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    }
                                                }}
                                            >
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
                    </div>

                    {/* Chat Input */}
                    <div className="p-3.5 border-t border-slate-200 dark:border-slate-800/90 bg-slate-50/70 dark:bg-[#161d2e]">
                        <form 
                            onSubmit={(e) => handleSendMessage(e)} 
                            className={`relative flex items-end gap-2 ${isFullWidth ? 'max-w-3xl mx-auto' : ''}`}
                        >
                            <div className="flex-1 relative">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => {
                                        setChatInput(e.target.value);
                                        // Auto-resize logic
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                            // Reset height
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                        }
                                    }}
                                    placeholder="Message local assistant..."
                                    rows={1}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-4 pr-4 py-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition-all shadow-inner resize-none min-h-[44px] max-h-[200px] custom-scrollbar"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isChatLoading}
                                className="p-2.5 rounded-xl bg-indigo-600 text-white disabled:opacity-30 disabled:bg-slate-400 transition-all shadow-lg shadow-indigo-500/20 shrink-0 mb-0.5"
                            >
                                <ChevronRight size={20} />
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </div>
    );
}
