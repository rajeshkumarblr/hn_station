import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User as UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface AISidebarProps {
    storyId: number;
    storyTitle: string;
    isOpen: boolean;
    onClose: () => void;
    initialSummary?: string; // Optional: if we want to preload the summary
    isSummarizing?: boolean;
}

export function AISidebar({ storyId, storyTitle, isOpen, onClose }: AISidebarProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);


    // Load history on mount
    useEffect(() => {
        if (isOpen && storyId) {
            fetchHistory();
        }
    }, [isOpen, storyId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl}/api/chat/${storyId}`, {
                credentials: 'include',
            });
            if (res.ok) {
                const history = await res.json();
                setMessages(history || []);
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSummarize = async () => {
        setLoading(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl}/api/stories/${storyId}/summarize`, {
                method: 'POST',
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to summarize');

            // Allow time for DB to process so we don't need to append manually if we fetch
            // But appending manually is snappier
            const summaryMsg: Message = { role: 'model', content: `**Summary of "${storyTitle}":**\n\n${data.summary}` };
            setMessages(prev => [summaryMsg, ...prev]); // Actually summary should be first ideally, or just append?
            // If history was empty, it's first. If not, it's new.
            // Let's just append to end for now, or re-fetch history.
            await fetchHistory();
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'model', content: `Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    story_id: storyId,
                    message: userMsg.content
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to get response');

            setMessages(prev => [...prev, { role: 'model', content: data.response }]);
        } catch (err: any) {
            setMessages(prev => [...prev, { role: 'model', content: `Error: ${err.message}` }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-semibold">
                    <Bot size={20} />
                    <span>AI Assistant</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar"
            >
                {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center p-4">
                        <Bot size={48} className="mb-4 opacity-20" />
                        <p className="mb-6 text-sm">Summarize this discussion or ask questions about it.</p>
                        <button
                            onClick={handleSummarize}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-all shadow-sm active:scale-95"
                        >
                            <Bot size={16} />
                            Summarize Discussion
                        </button>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                            : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300'
                            }`}>
                            {msg.role === 'user' ? <UserIcon size={16} /> : <Bot size={16} />}
                        </div>

                        <div className={`flex-1 max-w-[85%] text-sm rounded-2xl px-4 py-3 ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-sm shadow-sm'
                            }`}>
                            <div className="prose dark:prose-invert max-w-none prose-sm prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:p-2 prose-pre:rounded-md">
                                <ReactMarkdown>
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex gap-3">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-300 flex items-center justify-center">
                            <Bot size={16} />
                        </div>
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <form onSubmit={handleSend} className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about this story..."
                        disabled={loading}
                        className="w-full bg-slate-100 dark:bg-slate-900 border-0 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-blue-500/50 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || loading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
}
