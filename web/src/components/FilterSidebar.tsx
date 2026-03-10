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
        if (e.key === 'Enter' && inputValue.trim()) {
            const newTopic = inputValue.trim();
            setActiveTopics([newTopic]);
            setInputValue('');
        }
    };

    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;

    return (
        <div className="w-80 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* ── AI Summary (Now at Top) ────────────────────────────────────────────── */}
            <div className="h-[60%] flex-shrink-0 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/50">
                    <Sparkles size={12} className="text-orange-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Summary</h3>
                    {highlightedStory && (
                        <span className="ml-auto text-[10px] text-slate-500 truncate max-w-[100px]" title={highlightedStory.title}>
                            {highlightedStory.title.slice(0, 25)}{highlightedStory.title.length > 25 ? '…' : ''}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:bg-slate-200
                    dark:[&::-webkit-scrollbar-thumb]:bg-slate-700
                    [&::-webkit-scrollbar-thumb]:rounded-full">
                    {hasSummary ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-p:text-amber-500 dark:prose-p:text-amber-400
                            prose-p:font-bold
                            prose-li:text-amber-500 dark:prose-li:text-amber-400
                            prose-li:font-bold
                            prose-li:my-0.5
                            prose-ul:my-1.5
                            [&>ul]:space-y-0.5
                            prose-li:marker:text-slate-400
                            [&_li:nth-child(5n+1)]:text-orange-400
                            [&_li:nth-child(5n+2)]:text-blue-400
                            [&_li:nth-child(5n+3)]:text-emerald-400
                            [&_li:nth-child(5n+4)]:text-purple-400
                            [&_li:nth-child(5n+5)]:text-teal-400
                            text-[13px] leading-relaxed">
                            <ReactMarkdown>{summary!}</ReactMarkdown>
                        </div>
                    ) : highlightedStory ? (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8 opacity-60">
                            <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                                No summary yet.<br />
                                <span className="text-orange-400">Hover over a story</span> with a score &gt;10 to trigger generation.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8 opacity-60">
                            <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Hover a story to see its AI summary
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Topics / Tags (Now and Middle/Bottom) */}
            <div className="h-[40%] border-t border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
                {/* Search Input */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex-shrink-0">
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Topic Search</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search or add tags..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-10 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-slate-200 placeholder:text-slate-400"
                        />
                        {activeTopics.length > 0 && (
                            <button
                                onClick={() => setActiveTopics([])}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                                title="Clear Search"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="p-4 overflow-y-auto flex-1 hidden">
                    {/* Page tags removed as per user request */}
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
