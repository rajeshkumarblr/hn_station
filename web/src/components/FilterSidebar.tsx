import React, { useState } from 'react';
import { Sparkles, X, Download, ShieldCheck, Zap, Monitor, Copy, Check, RefreshCw, ChevronRight } from 'lucide-react';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';
import { getTagStyle, getNeutralTagStyle } from '../utils/colors';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    disabledTopics: string[];
    setDisabledTopics: React.Dispatch<React.SetStateAction<string[]>>;
    highlightedStory?: Story | null;
    onSummarize?: (id: number) => Promise<any>;
    user: any;
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
    setDisabledTopics,
    highlightedStory,
    onSummarize,
    user,
}) => {
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [copied, setCopied] = useState(false);

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
        try {
            await onSummarize?.(highlightedStory.id);
        } finally {
            setSummarizing(false);
        }
    };




    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;
    const aiEnabled = user?.ai_summaries_enabled;

    return (
        <div className="flex-1 shrink-0 h-full border-l border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/40 backdrop-blur-xl hidden md:flex flex-col gap-0 overflow-hidden">

            {/* ── AI Summary & Suggested Tags (Top 70%) ─────────────────────────────────── */}
            {(aiEnabled || hasSummary) ? (
                <div className="flex-1 overflow-hidden flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-slate-800/50">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2 mb-0.5">
                                <Sparkles size={12} className="text-lime-500" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Article Insight</h3>
                            </div>
                        </div>
                        
                        {hasSummary && (
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handleCopy}
                                    title="Copy Summary"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                                >
                                    {copied ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                                <button 
                                    onClick={handleRegen}
                                    disabled={summarizing}
                                    title="Regenerate Summary"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-white dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={summarizing ? "animate-spin" : ""} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Story Title Context — matches the lime/olive left-accent on the highlighted card */}
                    {highlightedStory && (
                        <div className="relative px-5 py-3.5 border-b border-lime-100 dark:border-lime-900/40 bg-gradient-to-r from-lime-50 via-lime-50/30 to-white dark:from-lime-950/30 dark:via-lime-950/15 dark:to-[#111827] border-l-[3px] border-l-lime-500">
                            <p className="text-[15px] font-bold text-amber-600 dark:text-amber-400 leading-snug line-clamp-2">
                                {highlightedStory.title}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                {highlightedStory.by && (
                                    <span className="text-lime-600/70 dark:text-lime-400/70 font-semibold">by {highlightedStory.by}</span>
                                )}
                                {highlightedStory.score != null && (
                                    <span className="flex items-center gap-0.5 text-amber-600/80 dark:text-amber-400/70 font-bold">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                        {highlightedStory.score}
                                    </span>
                                )}
                                {highlightedStory.descendants != null && highlightedStory.descendants > 0 && (
                                    <span className="flex items-center gap-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                        {highlightedStory.descendants}
                                    </span>
                                )}
                                {highlightedStory.time && (
                                    <span className="flex items-center gap-0.5">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
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

                    <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 custom-scrollbar border-l-2 border-lime-500/20 bg-gradient-to-b from-lime-50/30 to-transparent dark:from-lime-950/15 dark:to-transparent">
                        {hasSummary ? (
                            <>
                                {/* Markdown Summary with Index-Based Colors */}
                                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed font-semibold select-text mb-8">
                                    <ul className="pl-0 list-none m-0 space-y-4">
                                        {summary.split('\n').filter(line => line.trim().length > 0).map((line, idx) => {
                                            const colorClass = AI_COLORS[idx % AI_COLORS.length];
                                            const cleanLine = line.replace(/^[-*•]\s+/, '');
                                            return (
                                                <li key={idx} className={`${colorClass} flex gap-3 items-start group p-3 rounded-xl bg-gradient-to-r from-lime-50/50 to-transparent dark:from-lime-950/20 dark:to-transparent border border-lime-100/30 dark:border-lime-800/10 shadow-sm`}>
                                                    <ChevronRight size={14} className="mt-1 shrink-0 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                                    <div className="flex-1 text-slate-700 dark:text-slate-200">
                                                        <ReactMarkdown
                                                            components={{
                                                                p: ({ node, ...props }) => <span {...props} />,
                                                                strong: ({ node, ...props }) => <strong className="text-indigo-600 dark:text-indigo-400 font-black" {...props} />
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

                                
                                {/* Article Specific Topics (Suggested) - Moved from Header */}
                                {highlightedStory?.topics && highlightedStory.topics.length > 0 && (
                                    <div className="mt-6 border-t border-slate-100 dark:border-slate-800/50 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="flex items-center gap-1.5 mb-3">
                                            <Zap size={11} className="text-amber-500" />
                                            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-400">Article Topics</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {highlightedStory.topics.map(topic => {
                                                const isActive = activeTopics.includes(topic);
                                                const style = getTagStyle(topic);
                                                return (
                                                    <button
                                                        key={`article-topic-${topic}`}
                                                        onClick={() => {
                                                            if (isActive) {
                                                                setActiveTopics(prev => prev.filter(x => x !== topic));
                                                            } else {
                                                                setActiveTopics(prev => [...new Set([...prev, topic])]);
                                                                setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                            }
                                                        }}
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border shadow-sm ${isActive 
                                                            ? 'scale-105 ring-1 ring-offset-1 dark:ring-offset-slate-950 shadow-md' 
                                                            : 'opacity-50 hover:opacity-100 hover:scale-105 bg-white/5 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50'}`}
                                                        style={{ 
                                                            backgroundColor: style.bg, 
                                                            color: style.color, 
                                                            borderColor: isActive ? style.color : style.border
                                                        }}
                                                    >
                                                        {isActive ? '✓ ' : '#'}{topic}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : aiEnabled ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8 opacity-60">
                                <Sparkles size={24} className="text-slate-300 dark:text-slate-700 animate-pulse" />
                                <div>
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
