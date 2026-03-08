import React, { useState } from 'react';
import { Search, Layers, Sparkles } from 'lucide-react';
import { getTagStyle } from './StoryCard';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    getQueuedCount: () => number;
    onQueueAll: () => void;
    availableTags: string[];
    highlightedStory?: Story | null;  // The hovered/selected story for summary display
}

const POPULAR_TAGS = ['Postgres', 'Rust', 'AI', 'LLM', 'Go', 'React', 'Linux', 'Apple', 'Google'];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    getQueuedCount,
    onQueueAll,
    availableTags,
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

    const handleToggleTag = (tag: string) => {
        const lowerTag = tag.toLowerCase();
        const isActive = activeTopics.some(t => t.toLowerCase() === lowerTag);
        if (isActive) {
            setActiveTopics([]);
        } else {
            setActiveTopics([tag]);
        }
    };

    const matchingTags = POPULAR_TAGS.filter(tag =>
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !activeTopics.some(t => t.toLowerCase() === tag.toLowerCase())
    );

    const topTags = availableTags.slice(0, 15);
    const summary = highlightedStory?.summary ?? null;
    const hasSummary = summary && summary.trim().length > 0;

    return (
        <div className="w-72 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* Search Input */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex-shrink-0">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Topic Filters</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search or add tags..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:text-slate-200 placeholder:text-slate-400"
                    />
                </div>
                {inputValue && matchingTags.length > 0 && (
                    <div className="mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm overflow-hidden text-sm">
                        {matchingTags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => { handleToggleTag(tag); setInputValue(''); }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Topics / Tags */}
            <div className="flex flex-col gap-6 p-4 flex-shrink-0">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Page Topics</h3>
                        {activeTopics.length > 0 && (
                            <button
                                onClick={onQueueAll}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 transition-colors"
                                title="Add all highlighted stories to Queue"
                            >
                                <Layers size={12} />
                                Queue All
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {/* "All" Tag */}
                        <button
                            onClick={() => setActiveTopics([])}
                            className={`inline-flex items-center text-[11px] font-bold px-2 py-1 rounded-md border transition-all hover:scale-105 active:scale-95 ${activeTopics.length === 0
                                ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20'
                                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-500/50 hover:text-blue-500'
                                }`}
                        >
                            All
                        </button>

                        {topTags.map(tag => {
                            const isActive = activeTopics.some(t => t.toLowerCase() === tag.toLowerCase());
                            const ts = getTagStyle(tag);
                            return (
                                <button
                                    key={tag.toLowerCase()}
                                    onClick={() => handleToggleTag(tag)}
                                    className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-md transition-all hover:scale-105 active:scale-95"
                                    style={isActive ? {
                                        color: ts.color,
                                        background: ts.bg,
                                        border: `2px solid ${ts.color}`,
                                        boxShadow: `0 0 0 1px ${ts.color}`,
                                    } : {
                                        color: ts.color,
                                        background: ts.bg,
                                        border: `1px solid ${ts.border}`,
                                    }}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── AI Summary ────────────────────────────────────────────── */}
            <div className="flex-1 border-t border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0">
                    <Sparkles size={12} className="text-orange-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">AI Summary</h3>
                    {highlightedStory && (
                        <span className="ml-auto text-[10px] text-slate-500 truncate max-w-[100px]" title={highlightedStory.title}>
                            {highlightedStory.title.slice(0, 25)}{highlightedStory.title.length > 25 ? '…' : ''}
                        </span>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0
                    [&::-webkit-scrollbar]:w-1.5
                    [&::-webkit-scrollbar-track]:bg-transparent
                    [&::-webkit-scrollbar-thumb]:bg-slate-200
                    dark:[&::-webkit-scrollbar-thumb]:bg-slate-700
                    [&::-webkit-scrollbar-thumb]:rounded-full">
                    {hasSummary ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none
                            prose-p:text-slate-600 dark:prose-p:text-slate-300
                            prose-li:text-slate-600 dark:prose-li:text-slate-300
                            prose-li:my-0.5
                            prose-ul:my-1.5
                            [&>ul]:space-y-0.5
                            text-[12px] leading-relaxed">
                            <ReactMarkdown>{summary!}</ReactMarkdown>
                        </div>
                    ) : highlightedStory ? (
                        <div className="flex flex-col items-center justify-center h-20 text-center gap-2">
                            <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-snug">
                                No summary yet.<br />
                                <span className="text-orange-400">Hover over a story</span> with a score &gt;10 to trigger generation.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-20 text-center gap-2">
                            <Sparkles size={20} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                Hover a story to see its AI summary
                            </p>
                        </div>
                    )}
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
