import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Sparkles, X, MessageSquare, ChevronRight, Copy, Check, Zap, ExternalLink } from 'lucide-react';
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
    activeCommentId?: string | null;
    onFocusComment?: (id: string) => void;
    activeTab: 'discussion' | 'summary' | 'ai';
    onTabChange: (tab: 'discussion' | 'summary' | 'ai') => void;
    containerRef?: React.RefObject<HTMLDivElement>;
    width?: number;
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
    comments, commentsLoading, isIngesting, activeCommentId, onFocusComment,
    activeTab, onTabChange, containerRef, width = 480,
    activeTopics = [], disabledTopics = [], setActiveTopics, setDisabledTopics, topicMatch = 'any',
    onSummarizeStory
}: AISidebarProps) {
    const [discussSummarizing, setDiscussSummarizing] = useState(false);
    
    // Local Chat State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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
                    const ollamaModel = aiSettings.model || 'llama3.2:3b';
                    const res = await fetch(`${aiSettings.ollamaUrl}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: ollamaModel, prompt: prompt, stream: false })
                    });
                    if (!res.ok) throw new Error(`Ollama failed: ${res.status}`);
                    const data = await res.json();
                    discussionSummary = data.response || '';
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


    return (
        <div 
            className="h-full flex flex-col bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur-2xl border-l border-slate-200/50 dark:border-white/5 shadow-2xl relative transition-all duration-300 ease-in-out"
            style={isWebPreview() ? {
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
            {/* Header / Tabs Unified */}
            <div className="flex items-center justify-between px-2 bg-slate-50/50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <div className="flex flex-1 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => onTabChange('discussion')}
                        title="View community comments and analysis"
                        className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] border-b-2 transition-all shrink-0 ${activeTab === 'discussion' ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-500/5' : 'border-transparent text-slate-400 hover:text-slate-500 hover:bg-slate-500/5'}`}
                    >
                        <MessageSquare size={14} /> <span>Discussion</span>
                    </button>
                    {isWebPreview() && (
                        <button 
                            onClick={() => onTabChange('summary')}
                            title="View AI Takeaways and Summary"
                            className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] border-b-2 transition-all shrink-0 ${activeTab === 'summary' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-500 hover:bg-slate-500/5'}`}
                        >
                            <Sparkles size={14} /> <span>Summary</span>
                        </button>
                    )}
                    {!isWebPreview() && (
                        <button 
                            onClick={() => onTabChange('ai')}
                            title="Chat with local AI assistant (Privacy First)"
                            className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-[0.1em] border-b-2 transition-all shrink-0 ${activeTab === 'ai' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-500/5' : 'border-transparent text-slate-400 hover:text-slate-500 hover:bg-slate-500/5'}`}
                        >
                            <Sparkles size={14} /> <span>AI Assistant</span>
                        </button>
                    )}
                </div>
                
                <div className="flex items-center gap-2 mr-2">
                    <button 
                        onClick={() => {
                            if (activeTab === 'ai') {
                                setMessages([]);
                                setChatInput('');
                            }
                        }}
                        title={activeTab === 'ai' ? "Clear Chat History" : "Refresh Tab"}
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
                
                {/* Summary Tab Content (Web Preview only) */}
                {isWebPreview() && activeTab === 'summary' && (
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar bg-slate-50/50 dark:bg-[#0f172a]/50 flex flex-col gap-6 select-text text-slate-800 dark:text-slate-100">
                        {/* Domain & Link */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-base font-black leading-snug">{story.title}</h3>
                            {(() => {
                                let domain = '';
                                try {
                                    if (story.url) {
                                        domain = new URL(story.url).hostname.replace(/^www\./, '');
                                    }
                                } catch (e) {}
                                return domain ? (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold">
                                        <img
                                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                            alt=""
                                            className="w-4 h-4 rounded-sm grayscale hover:grayscale-0 transition-all"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span>{domain}</span>
                                    </div>
                                ) : null;
                            })()}
                        </div>

                        {/* Safe & Unrestricted Reading CTA Card */}
                        <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-indigo-500/10 border border-orange-500/20 dark:border-orange-500/10 rounded-2xl p-5 flex flex-col gap-4 shadow-md">
                            <div className="flex flex-col gap-1">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                    Safe & Unrestricted Reading
                                </h4>
                                <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                                    To protect user security, read the original article directly in a new tab for a 100% reliable distraction-free experience.
                                </p>
                            </div>
                            <a 
                                href={story.url || '#'} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 shadow-lg shadow-orange-500/20 active:scale-95 whitespace-nowrap self-start"
                            >
                                Read Article <ExternalLink size={12} />
                            </a>
                        </div>

                        {/* AI Summary Card */}
                        {story.summary ? (
                            <div className="bg-white dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/5 shadow-md rounded-2xl p-5 flex flex-col gap-3">
                                <div className="flex items-center gap-2 text-indigo-500 dark:text-indigo-400">
                                    <Sparkles size={16} className="animate-pulse" />
                                    <h4 className="text-[10px] font-black uppercase tracking-widest">AI Takeaways & Summary</h4>
                                </div>
                                <div className="prose prose-sm dark:prose-invert max-w-none text-[12px] leading-relaxed select-text text-slate-600 dark:text-slate-300">
                                    <ReactMarkdown>{story.summary}</ReactMarkdown>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-[#1e293b]/50 border border-dashed border-slate-200 dark:border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
                                <div className="w-10 h-10 bg-indigo-500/10 text-indigo-500 rounded-full flex items-center justify-center">
                                    <Sparkles size={20} />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">AI Summary Not Available</h4>
                                    <p className="text-[9px] text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                                        {isIngesting ? "Syncing details from Hacker News..." : "Click below to analyze and generate a concise bullet-point summary instantly."}
                                    </p>
                                </div>
                                {!isIngesting && onSummarizeStory && (
                                    <button 
                                        onClick={async () => {
                                            if (onSummarizeStory) {
                                                const res = await onSummarizeStory();
                                                if (res && res.summary) {
                                                    onSetSummary(res.summary, res.topics || []);
                                                }
                                            }
                                        }}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                                    >
                                        <Sparkles size={10} /> Generate Summary
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Extracted Topics */}
                        {story.topics && story.topics.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Extracted Topics</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {story.topics.map(topic => {
                                        const style = getTagStyle(topic);
                                        const isEnabled = activeTopics.includes(topic) && !disabledTopics.includes(topic);
                                        const isPresent = activeTopics.includes(topic);
                                        return (
                                            <button
                                                key={topic}
                                                onClick={() => {
                                                    if (!setActiveTopics) return;
                                                    if (!isPresent) {
                                                        setActiveTopics(prev => [...new Set([...prev, topic])]);
                                                        if (setDisabledTopics) {
                                                            if (topicMatch === 'exclusive') {
                                                                setDisabledTopics([...activeTopics]);
                                                            } else {
                                                                setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                            }
                                                        }
                                                    } else {
                                                        if (setDisabledTopics) {
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
                                                    }
                                                }}
                                                className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border shadow-sm"
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
                )}

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
                                                    li: ({node, ...props}) => {
                                                        // Check if this is a numbered list item by looking at the raw content string
                                                        const rawText = node?.children?.map((c: any) => c.value || c.children?.[0]?.value || '').join('') || '';
                                                        const isNumbered = /^\s*\d+\./.test(rawText);
                                                        
                                                        return (
                                                            <li className="flex gap-3 items-start mb-3 group">
                                                                {!isNumbered && (
                                                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400/50 group-hover:bg-indigo-500 shrink-0 transition-colors" />
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

                {/* Local AI Assistant Tab Content */}
                <div className={`flex-1 flex flex-col min-h-0 relative bg-white dark:bg-[#0f172a] ${activeTab !== 'ai' ? 'hidden' : ''}`}>
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
                                        {story.summary ? (
                                            <button 
                                                onClick={() => {
                                                    setMessages([{ role: 'assistant', content: `### Article Summary\n\n${story.summary}` }]);
                                                }}
                                                className="px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-500/20"
                                            >
                                                <Sparkles size={14} /> View Article Summary
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={async () => {
                                                    if (onSummarizeStory) {
                                                        const res = await onSummarizeStory();
                                                        if (res && res.summary) {
                                                            setMessages([{ role: 'assistant', content: `### Article Summary\n\n${res.summary}` }]);
                                                        }
                                                    }
                                                }}
                                                className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
                                            >
                                                <Sparkles size={14} /> Summarize Article
                                            </button>
                                        )}
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

                    {/* Chat Input */}
                    <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
                        <form 
                            onSubmit={(e) => handleSendMessage(e)} 
                            className="relative flex items-end gap-2"
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
