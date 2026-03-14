import React, { useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';
import { getTagStyle } from './StoryCard';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    disabledTopics: string[];
    setDisabledTopics: React.Dispatch<React.SetStateAction<string[]>>;
    getQueuedCount: () => number;
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
    getQueuedCount,
    highlightedStory,
}) => {
    const [inputValue, setInputValue] = useState('');

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
    const aiEnabled = (window as any).appState?.user?.ai_summaries_enabled;

    return (
        <div className="w-80 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* ── AI Summary (Top) ────────────────────────────────────────────── */}
            {(aiEnabled || hasSummary) ? (
                <div className="h-[55%] flex-shrink-0 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-4 duration-500">
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
                                            // Attempt to get index from parent if possible, otherwise deterministic hash
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
                <div className="h-48 flex-shrink-0 flex flex-col items-center justify-center text-center p-6 border-b border-slate-100 dark:border-slate-800/50 opacity-40 grayscale scale-95 transition-all">
                    <Sparkles size={24} className="text-slate-300 dark:text-slate-600 mb-2" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Features Disabled</h3>
                    <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-tighter">Enable in Settings</p>
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

            {/* Reading Queue Status */}
            <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                    <span>Reading Queue</span>
                    <span className="font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full text-xs">
                        {getQueuedCount()}
                    </span>
                </div>
            </div>

        </div>
    );
};
