import React, { useState } from 'react';
import { Search, Sparkles, X, Download, ShieldCheck, Zap, Monitor, Info } from 'lucide-react';
import { isWebPreview } from '../utils/env';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';
import { getTagStyle } from './StoryCard';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    disabledTopics: string[];
    setDisabledTopics: React.Dispatch<React.SetStateAction<string[]>>;
    highlightedStory?: Story | null;
}



const AI_COLORS = [
    'text-blue-500 dark:text-blue-400',
    'text-emerald-500 dark:text-emerald-400',
    'text-orange-500 dark:text-orange-400',
    'text-purple-500 dark:text-purple-400',
    'text-pink-500 dark:text-pink-400',
    'text-cyan-500 dark:text-cyan-400',
    'text-amber-500 dark:text-amber-400'
];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    disabledTopics,
    setDisabledTopics,
    highlightedStory,
}) => {
    const [inputValue, setInputValue] = useState('');
    const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const newTopic = inputValue.trim();
            if (newTopic) {
                // ADD to activeTopics if not already there
                setActiveTopics(prev => prev.includes(newTopic) ? prev : [...prev, newTopic]);
            }
            setInputValue('');
        }
    };

    const toggleTopicEnabled = (topic: string) => {
        setDisabledTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]);
    };

    const removeTopic = (topic: string) => {
        setActiveTopics(prev => prev.filter(t => t !== topic));
        setDisabledTopics(prev => prev.filter(t => t !== topic));
    };

    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;
    const isWebMode = isWebPreview();
    const aiEnabled = (window as any).appState?.user?.ai_summaries_enabled;

    return (
        <div className="w-80 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* ── AI Summary (Top) / Web CTA ────────────────────────────────────────────── */}
            {/* ── AI Summary (Top) ──────────────────────────────────────────────────────── */}
            {(aiEnabled || hasSummary) ? (
                <div className="h-[45%] flex-shrink-0 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/50">
                        <Sparkles size={12} className="text-orange-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Article Summary by AI</h3>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 custom-scrollbar">
                        {hasSummary ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed font-bold">
                                <ReactMarkdown
                                    components={{
                                        li: ({ node, ...props }) => {
                                            const text = String(props.children || '');
                                            let hash = 0;
                                            for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
                                            const color = AI_COLORS[Math.abs(hash) % AI_COLORS.length];
                                            return <li className={color} {...props} />;
                                        }
                                    }}
                                >
                                    {summary!}
                                </ReactMarkdown>
                            </div>
                        ) : aiEnabled ? (
                            <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8 opacity-60">
                                <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                    {highlightedStory ? 'No summary yet' : 'Hover a story to see summary'}
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="h-32 flex-shrink-0 flex flex-col items-center justify-center text-center p-6 border-b border-slate-100 dark:border-slate-800/50 opacity-40 grayscale scale-95 transition-all">
                    <Sparkles size={24} className="text-slate-300 dark:text-slate-600 mb-2" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Features</h3>
                    <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-tighter">Powered by Desktop App</p>
                </div>
            )}

            {/* ── Topics / Multi-Tag Search (Middle) ─────────────────────────────────── */}
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Topic Search</h3>
                        {activeTopics.length > 0 && (
                            <button
                                onClick={() => { setActiveTopics([]); setDisabledTopics([]); }}
                                className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-tighter transition-colors"
                            >
                                #clear all
                            </button>
                        )}
                    </div>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Add tag and press Enter..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-slate-200 placeholder:text-slate-400"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 min-h-[32px]">
                        {activeTopics.map(topic => {
                            const isDisabled = disabledTopics.includes(topic);
                            const style = getTagStyle(topic);

                            return (
                                <button
                                    key={topic}
                                    onClick={() => toggleTopicEnabled(topic)}
                                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all group animate-in fade-in zoom-in duration-200 border ${isDisabled
                                        ? 'bg-slate-100/50 dark:bg-slate-800/30 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 opacity-40 hover:opacity-100'
                                        : 'shadow-sm'
                                        }`}
                                    style={!isDisabled ? {
                                        backgroundColor: style.bg,
                                        color: style.color,
                                        borderColor: style.border,
                                        fontWeight: 'bold'
                                    } : {}}
                                >
                                    <span>#{topic}</span>
                                    {!isDisabled && (
                                        <div
                                            onClick={(e) => { e.stopPropagation(); removeTopic(topic); }}
                                            className="p-0.5 rounded-full hover:bg-red-500/20 hover:text-red-500 transition-colors"
                                        >
                                            <X size={10} className="opacity-60 group-hover:opacity-100" />
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                        {activeTopics.length === 0 && (
                            <p className="text-[11px] text-slate-400 italic py-1">No active tags. Type above to add.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-end">
                {isWebMode && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsFeaturesModalOpen(true)}
                            className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
                            title="Desktop Features"
                        >
                            <Info size={16} />
                        </button>
                        <a
                            href="/api/download/latest"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm"
                        >
                            <Download size={12} />
                            Download
                        </a>
                    </div>
                )}
            </div>

            {isWebMode && (
                <div className="px-4 pb-4 bg-slate-50/50 dark:bg-slate-900/30">
                    <button
                        onClick={() => setIsFeaturesModalOpen(true)}
                        className="text-[10px] text-slate-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                    >
                        <span>Download For Desktop</span>
                        <span className="opacity-60">•</span>
                        <span className="underline decoration-slate-300 dark:decoration-slate-700">link to features</span>
                    </button>
                </div>
            )}

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
