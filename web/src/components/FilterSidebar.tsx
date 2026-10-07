import React, { useState } from 'react';
import { Sparkles, X, Download, ShieldCheck, Zap, Monitor, Copy, Check, RefreshCw, ChevronRight } from 'lucide-react';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';
import { getTagStyle } from '../utils/colors';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    disabledTopics: string[];
    setDisabledTopics: React.Dispatch<React.SetStateAction<string[]>>;
    highlightedStory?: Story | null;
    onSummarize?: (id: number) => Promise<any>;
    user: any;
    topicMatch?: 'any' | 'all' | 'exclusive';
}



const AI_COLORS = [
    'text-blue-500 dark:text-blue-400',
    'text-emerald-500 dark:text-emerald-400',
    'text-orange-500 dark:text-orange-400',
    'text-purple-500 dark:text-purple-400',
    'text-rose-500 dark:text-rose-400'
];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    disabledTopics,
    setDisabledTopics,
    highlightedStory,
    onSummarize,
    user,
    topicMatch = 'any',
}) => {
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    React.useEffect(() => {
        setErrorMsg(null);
    }, [highlightedStory?.id]);

    const handleCopy = async () => {
        if (!highlightedStory?.summary) return;
        try {
            await navigator.clipboard.writeText(highlightedStory.summary);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const handleRegen = async () => {
        if (!highlightedStory?.id || summarizing) return;
        setSummarizing(true);
        setErrorMsg(null);
        try {
            const res = await onSummarize?.(highlightedStory.id);
            if (res && res.error) {
                setErrorMsg(res.error);
            }
        } catch (e: any) {
            setErrorMsg(e?.message || 'Summarization failed');
        } finally {
            setSummarizing(false);
        }
    };




    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;
    const aiEnabled = user?.ai_summaries_enabled;

    return (
        <div className="flex-1 shrink-0 h-full border-l border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#161d2e] backdrop-blur-xl hidden md:flex flex-col gap-0 overflow-hidden">

            {/* ── AI Summary & Suggested Tags (Top 70%) ─────────────────────────────────── */}
            {(aiEnabled || hasSummary) ? (
                <div className="flex-1 overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#1a2234]/60">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                                <Sparkles size={12} className="text-amber-500" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">Article Insight</h3>
                            </div>
                        </div>
                        
                        {hasSummary && (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleCopy}
                                    title="Copy Summary"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                                <button 
                                    onClick={handleRegen}
                                    disabled={summarizing}
                                    title="Regenerate Summary"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={summarizing ? "animate-spin" : ""} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Story Title Context */}
                    {highlightedStory && (
                        <div className="relative px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-amber-50/40 dark:bg-[#1d263b] border-l-[3px] border-l-amber-500">
                            <p className="text-[14.5px] font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                                {highlightedStory.title}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                {highlightedStory.by && (
                                    <span className="text-slate-600 dark:text-slate-300 font-semibold">by {highlightedStory.by}</span>
                                )}
                                {highlightedStory.score != null && (
                                    <span className="flex items-center gap-0.5 text-orange-600 dark:text-amber-400 font-bold">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                        {highlightedStory.score}
                                    </span>
                                )}
                                {highlightedStory.descendants != null && highlightedStory.descendants > 0 && (
                                    <span className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                        {highlightedStory.descendants}
                                    </span>
                                )}
                                {highlightedStory.time && (
                                    <span className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                        {(() => {
                                            const d = new Date(highlightedStory.time);
                                            const s = Math.floor((Date.now() - d.getTime()) / 1000);
                                            if (s > 86400) return Math.floor(s / 86400) + 'd';
                                            if (s > 3600) return Math.floor(s / 3600) + 'h';
                                            if (s > 60) return Math.floor(s / 60) + 'm';
                                            return s + 's';
                                        })()}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 custom-scrollbar">
                        {hasSummary ? (
                            <>
                                {/* Markdown Summary with Index-Based Colors */}
                                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed font-medium select-text mb-6">
                                    <ul className="pl-0 list-none m-0 space-y-2.5">
                                        {summary.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
                                            const colorClass = AI_COLORS[idx % AI_COLORS.length];
                                            
                                            // Extract potential bullet or number (e.g., "1.", "-", "*")
                                            const bulletMatch = line.match(/^\s*([-*•]|\d+\.)\s+(.*)/);
                                            const bullet = bulletMatch ? bulletMatch[1] : null;
                                            const content = bulletMatch ? bulletMatch[2] : line.trim();
                                            
                                            return (
                                                <li key={idx} className={`${colorClass} flex gap-0 items-start group p-3 rounded-xl bg-slate-50 dark:bg-[#1c2539] border border-slate-200/70 dark:border-slate-700/70 shadow-sm transition-all`}>
                                                    <div className="flex items-center justify-center w-6 shrink-0 pt-0.5">
                                                        {bullet && /^\d+\./.test(bullet) ? (
                                                            <span className="text-[11px] font-black opacity-70 group-hover:opacity-100 transition-opacity leading-none">{bullet}</span>
                                                        ) : (
                                                            <ChevronRight size={14} className="opacity-70 group-hover:opacity-100 transition-all" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 text-slate-700 dark:text-slate-200 min-w-0 leading-relaxed">
                                                        <ReactMarkdown
                                                            components={{
                                                                p: ({ node, ...props }) => <span className="block m-0 p-0" {...props} />,
                                                                strong: ({ node, ...props }) => <strong className="text-indigo-600 dark:text-amber-300 font-bold" {...props} />
                                                            }}
                                                        >
                                                            {content}
                                                        </ReactMarkdown>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>

                                
                                {/* Article Specific Topics (Suggested) */}
                                {highlightedStory?.topics && highlightedStory.topics.length > 0 && (
                                    <div className="mt-4 border-t border-slate-200/80 dark:border-slate-800/80 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center gap-1.5 mb-2.5">
                                            <Zap size={11} className="text-amber-500" />
                                            <h4 className="text-[9.5px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Article Topics (Click to Filter)</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {highlightedStory.topics.map(topic => {
                                                const isPresent = activeTopics.includes(topic);
                                                const isEnabled = isPresent && !disabledTopics.includes(topic);
                                                const style = getTagStyle(topic);
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
                                                        className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all border shadow-sm cursor-pointer ${isEnabled 
                                                            ? 'scale-105 ring-1 ring-offset-1 dark:ring-offset-[#161d2e] shadow-md' 
                                                            : 'hover:scale-105'}`}
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
                            </>
                        ) : aiEnabled ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8 opacity-80">
                                <Sparkles size={24} className="text-slate-300 dark:text-slate-700" />
                                <div className="flex flex-col items-center">
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">
                                        {highlightedStory ? 'Ready to analyze' : 'Hover a story'}
                                    </p>
                                    {highlightedStory && (
                                        <button 
                                            onClick={handleRegen}
                                            disabled={summarizing}
                                            className="mt-4 px-4 py-1.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-blue-700 transition-all flex items-center gap-1.5"
                                        >
                                            {summarizing ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            {summarizing ? 'Summarizing...' : 'Summarize Article'}
                                        </button>
                                    )}
                                    {errorMsg && (
                                        <p className="mt-3 px-3 py-2 text-[11px] text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg max-w-[240px] leading-snug break-words select-text">
                                            {errorMsg}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* Removed bottom pane for deskop-cleanliness */}

            {/* Features Modal */}
            {isFeaturesModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Monitor size={18} className="text-blue-500" />
                                Desktop Features
                            </h2>
                            <button
                                onClick={() => setIsFeaturesModalOpen(false)}
                                className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl h-fit">
                                        <ShieldCheck className="text-emerald-600 dark:text-emerald-400" size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">100% Private & Offline-first</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                            Your data never leaves your machine. Local AI ensures absolute privacy.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl h-fit">
                                        <Sparkles className="text-amber-600 dark:text-amber-400" size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Local LLM Integration</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                            Directly connects with Ollama to run Llama3, Mistral, and more locally.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl h-fit">
                                        <Zap className="text-blue-600 dark:text-blue-400" size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Multi-tab Workspace</h4>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                            Powerful split-view and tab management for deep research.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <a
                                href="/api/download/latest"
                                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all font-bold text-sm"
                            >
                                <Download size={18} />
                                Download for Windows
                            </a>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
