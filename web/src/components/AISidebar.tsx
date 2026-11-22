import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, X, MessageSquare, ChevronRight, Copy, Check, AlertCircle, Plus, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import { isWebPreview } from '../utils/env';
import { getClientAISettings, clientGenerateChatResponse } from '../utils/aiClient';
import type { Story, User } from '../types';
import { CommentList } from './CommentList';

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
            className={`h-full flex flex-col bg-[#fafaf8] dark:bg-[#121214] relative transition-all duration-200 ${isFullWidth ? '' : 'border-l border-stone-200/80 dark:border-white/[0.07]'}`}
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
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#f5f5f2] dark:bg-[#161619] border-b border-stone-200/80 dark:border-white/[0.07] shrink-0">
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => onTabChange('discussion')}
                            title="View community comments"
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${activeTab === 'discussion' ? 'bg-stone-200/80 dark:bg-white/[0.1] text-stone-900 dark:text-zinc-100' : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200'}`}
                        >
                            <MessageSquare size={12} /> <span>Discussion</span>
                        </button>
                        <button 
                            onClick={() => onTabChange('ai')}
                            title="Summary & Q&A"
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${activeTab === 'ai' ? 'bg-stone-200/80 dark:bg-white/[0.1] text-stone-900 dark:text-zinc-100' : 'text-stone-500 dark:text-zinc-400 hover:text-stone-800 dark:hover:text-zinc-200'}`}
                        >
                            <span>Ask AI</span>
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        {activeTab === 'ai' && (
                            <button 
                                onClick={() => { setMessages([]); setChatInput(''); }}
                                title="Clear Chat History"
                                className="p-1 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
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
                                        className="flex items-center gap-1 px-2 py-1 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] rounded-md text-[11.5px] font-medium text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-white transition-colors cursor-pointer"
                                    >
                                        <Maximize2 size={11} />
                                        <span>Maximize</span>
                                    </button>
                                )}
                                <button 
                                    onClick={onClose}
                                    title="Hide pane (Maximize Article)"
                                    className="p-1 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Content Container */}
            <div className="flex-1 overflow-hidden relative flex flex-col bg-[#fafaf8] dark:bg-[#121214]">

                {/* Discussion Tab Content */}
                <div 
                    ref={containerRef}
                    className={`flex-1 flex flex-col relative overflow-hidden focus:outline-none ${activeTab !== 'discussion' ? 'hidden' : ''}`}
                    tabIndex={-1}
                >
                    <div className="flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
                        <div className={isFullWidth ? 'max-w-3xl mx-auto' : ''}>
                            {/* Compact Discussion Action Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 mb-4 border-b border-stone-200/80 dark:border-white/[0.08]">
                                <div className="min-w-0">
                                    {isFullWidth && (
                                        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-stone-900 dark:text-[#f2f2f5] leading-snug mb-1 truncate">
                                            {story.title}
                                        </h2>
                                    )}
                                    <div className="flex items-center gap-2 text-[12px] text-stone-500 dark:text-zinc-400">
                                        <span className="font-medium text-stone-700 dark:text-zinc-300 tabular-nums">
                                            {comments.length > 0 ? `${comments.length} comments` : `${story.descendants || 0} comments`}
                                        </span>
                                        {refreshComments && (
                                            <button
                                                onClick={refreshComments}
                                                title="Refresh comments"
                                                className="p-1 rounded hover:bg-stone-200/60 dark:hover:bg-white/[0.06] text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                                            >
                                                <RefreshCw size={12} className={commentsLoading ? 'animate-spin text-[#e06834]' : ''} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {!isWebPreview() && !story.discussion_summary && comments.length > 0 && (
                                        <button 
                                            onClick={handleSummarizeDiscussion}
                                            disabled={discussSummarizing}
                                            className="px-2.5 py-1 bg-stone-200/70 dark:bg-white/[0.06] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            {discussSummarizing && <RefreshCw size={11} className="animate-spin" />}
                                            <span>{discussSummarizing ? 'Summarizing…' : 'Summarize'}</span>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setShowCommentComposer(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                                            showCommentComposer
                                                ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                                : 'bg-stone-200/70 dark:bg-white/[0.06] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300'
                                        }`}
                                    >
                                        <Plus size={12} className={showCommentComposer ? 'rotate-45 transition-transform' : 'transition-transform'} />
                                        <span>{showCommentComposer ? 'Cancel' : 'Comment'}</span>
                                    </button>

                                    {isFullWidth && onToggleMaximize && (
                                        <button
                                            onClick={onToggleMaximize}
                                            title="Restore Side-by-Side Split View"
                                            className="px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors flex items-center gap-1 bg-stone-200/70 dark:bg-white/[0.06] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300 cursor-pointer"
                                        >
                                            <Minimize2 size={11} />
                                            <span>Split</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Collapsible Comment Composer */}
                            {showCommentComposer && (
                                <div className="mb-5 p-3.5 bg-stone-100/80 dark:bg-[#18181b] rounded-lg border border-stone-200 dark:border-white/[0.08] flex flex-col gap-2.5">
                                    <textarea
                                        value={topCommentText}
                                        onChange={(e) => setTopCommentText(e.target.value)}
                                        placeholder="Add to the HN discussion..."
                                        rows={3}
                                        autoFocus
                                        className="w-full text-[13px] p-2.5 rounded-md border border-stone-200 dark:border-zinc-800 bg-white dark:bg-[#121214] text-stone-900 dark:text-zinc-100 placeholder-stone-400 dark:placeholder-zinc-500 focus:border-stone-400 dark:focus:border-zinc-600 outline-none resize-none"
                                    />
                                    {topCommentError && (
                                        <div className="text-[11.5px] text-red-500 font-medium flex items-center gap-1">
                                            <AlertCircle size={12} className="shrink-0" />
                                            {topCommentError}
                                        </div>
                                    )}
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => { setShowCommentComposer(false); setTopCommentError(null); }}
                                            className="px-3 py-1.5 text-[12px] font-medium text-stone-500 hover:text-stone-800 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-md cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleTopCommentSubmit}
                                            disabled={topCommentSubmitting || !topCommentText.trim()}
                                            className="px-3.5 py-1.5 text-[12px] font-medium text-white bg-stone-900 dark:bg-zinc-100 dark:text-zinc-950 hover:opacity-90 disabled:opacity-40 rounded-md transition-opacity cursor-pointer"
                                        >
                                            {topCommentSubmitting ? 'Posting…' : 'Post Comment'}
                                        </button>
                                    </div>
                                </div>
                            )}

                        {((commentsLoading && comments.length === 0) || (isIngesting && comments.length === 0)) ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-stone-400 dark:text-zinc-500">
                                <RefreshCw size={18} className="animate-spin" />
                                <span className="text-[12.5px]">
                                    {isIngesting ? "Syncing discussion from HN…" : "Loading discussion…"}
                                </span>
                            </div>
                        ) : (comments && comments.length > 0) || isIngesting ? (
                            <div className="pb-16 space-y-5">

                                {/* Discussion Summary */}
                                {!isWebPreview() && story.discussion_summary && (
                                    <div className="p-5 bg-[#f5f5f2] dark:bg-[#17171a] rounded-lg border border-stone-200/80 dark:border-white/[0.08]">
                                        <h4 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500 mb-3">Discussion summary</h4>
                                        <div className="font-editorial prose prose-stone dark:prose-invert prose-sm max-w-none text-stone-700 dark:text-[#d4d4d8] leading-[1.7]">
                                            <ReactMarkdown
                                                components={{
                                                    li: ({node, ...props}) => {
                                                        const rawText = node?.children?.map((c: any) => c.value || c.children?.[0]?.value || '').join('') || '';
                                                        const isNumbered = /^\s*\d+\./.test(rawText);
                                                        return (
                                                            <li className="flex gap-2.5 items-start mb-2">
                                                                {!isNumbered && (
                                                                    <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-[#e06834]/75 shrink-0" />
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

                                {/* Quiet Monochrome Article Topics */}
                                {story.topics && story.topics.length > 0 && setActiveTopics && setDisabledTopics && (
                                    <div className="mt-8 pt-5 border-t border-stone-200/80 dark:border-white/[0.07]">
                                        <h4 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500 mb-2.5">Topics</h4>
                                        <div className="flex flex-wrap gap-1.5">
                                            {story.topics.map(topic => {
                                                const isPresent = activeTopics.includes(topic);
                                                const isEnabled = isPresent && !disabledTopics.includes(topic);
                                                return (
                                                    <button
                                                        key={`article-topic-${topic}`}
                                                        onClick={() => {
                                                            if (!isPresent) {
                                                                setActiveTopics(prev => [...new Set([...prev, topic])]);
                                                                if (topicMatch === 'exclusive') {
                                                                    setDisabledTopics([...activeTopics]);
                                                                } else {
                                                                    setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                                }
                                                            } else {
                                                                if (isEnabled) {
                                                                    setDisabledTopics(prev => [...new Set([...prev, topic])]);
                                                                } else {
                                                                    if (topicMatch === 'exclusive') {
                                                                        setDisabledTopics(activeTopics.filter(x => x !== topic));
                                                                    } else {
                                                                        setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                        className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                                                            isEnabled
                                                                ? 'bg-stone-900 text-white dark:bg-[#27272d] dark:text-zinc-100 dark:ring-1 dark:ring-[#e06834]/60'
                                                                : 'bg-stone-200/65 text-stone-600 hover:bg-stone-200 dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/[0.1] dark:hover:text-zinc-200'
                                                        }`}
                                                    >
                                                        {topic}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                                <h3 className="text-[14px] font-medium text-stone-600 dark:text-zinc-300 mb-1.5">No comments yet</h3>
                                <p className="text-[12.5px] text-stone-400 dark:text-zinc-500 leading-relaxed max-w-[240px] mb-5">
                                    Hacker News discussion hasn&apos;t been synced yet.
                                </p>
                                
                                {story.descendants > 0 && (
                                    <button
                                        onClick={async () => {
                                            const baseUrl = getApiBase();
                                            await fetchWithAuth(`${baseUrl}/api/stories/${story.id}`);
                                            window.location.reload();
                                        }}
                                        className="px-4 py-2 bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
                                    >
                                        Sync {story.descendants} comments
                                    </button>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                </div>

                {/* Local AI Assistant Tab Content */}
                <div className={`flex-1 flex flex-col min-h-0 relative bg-[#fafaf8] dark:bg-[#121214] ${activeTab !== 'ai' ? 'hidden' : ''}`}>
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar min-h-0">
                        <div className={`space-y-6 ${isFullWidth ? 'max-w-3xl mx-auto' : ''}`}>
                        {messages.length === 0 ? (
                            <div className="py-4 space-y-6">
                                {isFullWidth && (
                                    <h2 className="text-[19px] font-semibold tracking-[-0.015em] text-stone-900 dark:text-[#f2f2f5] leading-snug">
                                        {story.title}
                                    </h2>
                                )}
                                {story.summary ? (
                                    <div className="space-y-3">
                                        <h3 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500">Key takeaways</h3>
                                        <ul className="space-y-3 m-0 p-0 list-none">
                                            {story.summary.split('\n').map(l => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean).map((line, i) => (
                                                <li key={i} className="flex items-start gap-3 font-editorial text-[14.5px] text-stone-700 dark:text-[#d6d6dc] leading-[1.7]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#e06834]/75 mt-[10px] shrink-0" />
                                                    <span>{line}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="py-4 space-y-3">
                                        <p className="text-[13px] text-stone-500 dark:text-zinc-400 max-w-sm">
                                            Generate a summary of this article or ask questions below using your local model.
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
                                            className="px-3.5 py-1.5 bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 hover:opacity-90 rounded-lg text-[12px] font-medium transition-opacity cursor-pointer"
                                        >
                                            Summarize Article
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 pt-3 border-t border-stone-200/80 dark:border-white/[0.07]">
                                    <button 
                                        onClick={() => setChatInput("What are the key technical takeaways from this article?")}
                                        className="px-3 py-1.5 bg-stone-200/60 dark:bg-white/[0.05] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300 rounded-md text-[12px] transition-colors cursor-pointer"
                                    >
                                        Key technical takeaways?
                                    </button>
                                    <button 
                                        onClick={() => setChatInput("What is the main consensus and pushback in the HN comments?")}
                                        className="px-3 py-1.5 bg-stone-200/60 dark:bg-white/[0.05] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300 rounded-md text-[12px] transition-colors cursor-pointer"
                                    >
                                        Main consensus &amp; pushback in comments?
                                    </button>
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[90%] rounded-xl px-4 py-3 ${
                                        msg.role === 'user' 
                                            ? 'bg-stone-200/90 dark:bg-[#27272d] text-stone-900 dark:text-zinc-100 border border-stone-300/60 dark:border-white/[0.08] ml-auto' 
                                            : 'bg-stone-100 dark:bg-[#19191d] text-stone-800 dark:text-zinc-200 border border-stone-200/80 dark:border-white/[0.07] mr-auto'
                                    }`}>
                                        <div className="prose prose-sm dark:prose-invert max-w-none text-[13.5px] leading-relaxed break-words overflow-x-hidden select-text prose-code:before:content-none prose-code:after:content-none">
                                            <ReactMarkdown
                                                rehypePlugins={[rehypeHighlight]}
                                                components={{
                                                    pre: ({ children }) => <>{children}</>,
                                                    code({ node, inline, className, children, ...props }: any) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        const codeString = String(children).replace(/\n$/, '');
                                                        
                                                        if (!inline && (match || codeString.includes('\n'))) {
                                                            const lang = match ? match[1] : 'code';
                                                            return (
                                                                <div className="my-3 rounded-lg border border-stone-300/60 dark:border-white/10 overflow-hidden bg-zinc-950/90">
                                                                    <div className="flex items-center justify-between px-3 py-1 bg-white/5 border-b border-white/10">
                                                                        <span className="text-[10px] font-medium text-zinc-400">
                                                                            {lang}
                                                                        </span>
                                                                        <CopyButton text={codeString} />
                                                                    </div>
                                                                    <code className={`${className} block p-3.5 overflow-x-auto custom-scrollbar font-mono text-[12.5px] leading-relaxed text-zinc-200`} {...props}>
                                                                        {children}
                                                                    </code>
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        return (
                                                            <code className="bg-stone-200/70 dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-stone-900 dark:text-zinc-200 font-mono text-[0.9em]" {...props}>
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
                            <div className="flex justify-start">
                                <div className="bg-stone-100 dark:bg-[#19191d] border border-stone-200/80 dark:border-white/[0.07] rounded-xl px-4 py-3 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                                    <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                    <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                        </div>
                    </div>

                    {/* Chat Input */}
                    <div className="p-3.5 border-t border-stone-200/80 dark:border-white/[0.07] bg-[#f5f5f2] dark:bg-[#161619]">
                        <form 
                            onSubmit={(e) => handleSendMessage(e)} 
                            className={`relative flex items-end gap-2 ${isFullWidth ? 'max-w-3xl mx-auto' : ''}`}
                        >
                            <div className="flex-1 relative">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => {
                                        setChatInput(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                        }
                                    }}
                                    placeholder="Ask about this article or discussion..."
                                    rows={1}
                                    className="w-full bg-white dark:bg-[#121214] border border-stone-200 dark:border-zinc-800 rounded-lg px-3.5 py-2.5 text-[13px] text-stone-900 dark:text-zinc-100 placeholder-stone-400 dark:placeholder-zinc-500 focus:outline-none focus:border-stone-400 dark:focus:border-zinc-600 transition-colors resize-none min-h-[42px] max-h-[200px] custom-scrollbar"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isChatLoading}
                                className="p-2.5 rounded-lg bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 disabled:opacity-30 transition-opacity shrink-0 cursor-pointer"
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
