import React, { useState } from 'react';
import { Search, Sparkles, X } from 'lucide-react';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    getQueuedCount: () => number;
    highlightedStory?: Story | null;  // The hovered/selected story for summary display
}



export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
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

    const toggleTopic = (topic: string) => {
        setActiveTopics(prev => prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]);
    };

    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;

    return (
        <div className="w-80 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* ── AI Summary (Top) ────────────────────────────────────────────── */}
            <div className="h-[55%] flex-shrink-0 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/50">
                    <Sparkles size={12} className="text-orange-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Summary</h3>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 custom-scrollbar">
                    {hasSummary ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed font-bold">
                            <ReactMarkdown>{summary!}</ReactMarkdown>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8 opacity-60">
                            <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                {highlightedStory ? 'No summary yet' : 'Hover a story to see summary'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Topics / Multi-Tag Search (Middle) ─────────────────────────────────── */}
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Topic Search</h3>
                        {activeTopics.length > 0 && (
                            <button
                                onClick={() => setActiveTopics([])}
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
                        {activeTopics.map(topic => (
                            <button
                                key={topic}
                                onClick={() => toggleTopic(topic)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-500/10 hover:bg-red-500/20 text-blue-500 hover:text-red-500 border border-blue-500/30 hover:border-red-500/50 text-[11px] font-bold transition-all group animate-in fade-in zoom-in duration-200"
                            >
                                #{topic}
                                <X size={10} className="opacity-60 group-hover:opacity-100" />
                            </button>
                        ))}
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
