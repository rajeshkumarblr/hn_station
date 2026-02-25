import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, User as UserIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface AISidebarProps {
    storyId: number;
    isOpen: boolean;
    onClose: () => void;
    initialSummary?: string; // Optional: if we want to preload the summary
    isSummarizing?: boolean;
}

export function AISidebar({ storyId, isOpen, onClose, initialSummary }: AISidebarProps) {
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
    }, [isOpen, storyId, initialSummary]);

    const fetchHistory = async () => {
        console.log("AISidebar: fetchHistory started", { storyId, isOpen, initialSummary });
        setLoading(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl}/api/chat/${storyId}`, {
                credentials: 'include',
            });
            console.log("AISidebar: fetchHistory response", res.status);

            if (res.ok) {
                const history = await res.json();
                console.log("AISidebar: history length", history?.length);

                if (history && history.length > 0) {
                    setMessages(history);
                } else {
                    // No history. Check if we have an initial summary.
                    if (initialSummary) {
                        console.log("AISidebar: Using initialSummary");
                        setMessages([{
                            role: 'model',
                            content: `Discussion Summary:\n\n${initialSummary}`
                        }]);
                        return;
                    }

                    // If still no summary, forcefully generate it on-demand
                    console.log("AISidebar: Calling ensureSummary");
                    ensureSummary();
                }
            }
        } catch (err) {
            console.error("Failed to fetch history", err);
            if (initialSummary) {
                setMessages([{
                    role: 'model',
                    content: `Discussion Summary:\n\n${initialSummary}`
                }]);
            }
        } finally {
            setLoading(false);
        }
    };

    const ensureSummary = async () => {
        // Don't set global loading yet, we'll show a specific message or just loading state
        setLoading(true);
        // Add a placeholder message?

        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl} /api/stories / ${storyId}/summarize`, {
                method: 'POST',
                credentials: 'include',
            });

            if (res.ok) {
                const data = await res.json();
                if (data.summary) {
                    setMessages([{
                        role: 'model',
                        content: `Discussion Summary:\n\n${data.summary}`
                    }]);
                }
            } else {
                // Explicitly show error
                setMessages([{
                    role: 'model',
                    content: `_I'm having trouble generating a summary right now due to high demand. Please try asking me a specific question or click "Summarize Story" again in a moment._`
                }]);
            }
        } catch (e) {
            console.error("Failed to ensure summary", e);
            setMessages([{
                role: 'model',
                content: `_I'm having trouble connecting right now. Please try again later._`
            }]);
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
                        <p className="mb-2 text-sm font-medium">How can I help you?</p>
                        <p className="text-xs opacity-70 mb-6">Ask questions about this story or request a summary.</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {msg.role === 'user' && (
                            <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                                <UserIcon size={16} />
                            </div>
                        )}

                        <div className={`text-sm rounded-2xl px-4 py-3 ${msg.role === 'user'
                            ? 'flex-1 max-w-[85%] bg-blue-600 text-white rounded-tr-sm'
                            : 'w-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-100 border border-emerald-200 dark:border-emerald-800 rounded-tl-sm shadow-sm'
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
                        <div className="w-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                <form onSubmit={handleSend} className="relative">
                    <div className="relative">
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
                    </div>
                </form>
            </div>
        </div>
    );
}
