import React, { useState } from 'react';
import { Search, Layers } from 'lucide-react';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    getQueuedCount: () => number;
    onQueueAll: () => void;
    availableTags: string[];
}

const POPULAR_TAGS = ['Postgres', 'Rust', 'AI', 'LLM', 'Go', 'React', 'Linux', 'Apple', 'Google'];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    getQueuedCount,
    onQueueAll,
    availableTags
}) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            const newTopic = inputValue.trim();
            setActiveTopics([newTopic]); // Single topic toggle
            setInputValue('');
        }
    };

    const handleToggleTag = (tag: string) => {
        const lowerTag = tag.toLowerCase();
        const isActive = activeTopics.some(t => t.toLowerCase() === lowerTag);
        if (isActive) {
            setActiveTopics([]); // Toggle off
        } else {
            setActiveTopics([tag]); // Toggle on (replaces others)
        }
    };

    const matchingTags = POPULAR_TAGS.filter(tag =>
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !activeTopics.some(t => t.toLowerCase() === tag.toLowerCase())
    );

    // Get top 15 tags from availableTags
    const topTags = availableTags.slice(0, 15);

    return (
        <div className="w-72 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm hidden md:flex flex-col gap-0 border-t-0 overflow-hidden">

            {/* Search Input */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/50">
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

            {/* Topics Area */}
            <div className="flex flex-col gap-6 p-4">
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Page Topics</h3>
                        {/* Queue All Action */}
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
                            return (
                                <button
                                    key={tag.toLowerCase()}
                                    onClick={() => handleToggleTag(tag)}
                                    className={`inline-flex items-center text-[11px] font-medium px-2 py-1 rounded-md border transition-all hover:scale-105 active:scale-95 ${isActive
                                        ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30 font-bold shadow-sm'
                                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-500/50 hover:text-blue-500'
                                        }`}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Reading Queue Status */}
            <div className="mt-auto p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
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
