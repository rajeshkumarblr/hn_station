import React, { useState } from 'react';
import { Search, Layers } from 'lucide-react';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    removeTopicChip: (topic: string) => void;
    getTopicColor: (topic: string) => { bg: string; text: string; border: string; accent: string };
    getQueuedCount: () => number;
    onQueueAll: () => void;
    availableTags: string[];
}

const POPULAR_TAGS = ['Postgres', 'Rust', 'AI', 'LLM', 'Go', 'React', 'Linux', 'Apple', 'Google'];

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    removeTopicChip,
    getTopicColor,
    getQueuedCount,
    onQueueAll,
    availableTags
}) => {
    const [inputValue, setInputValue] = useState('');

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && inputValue.trim()) {
            const newTopic = inputValue.trim();
            if (!activeTopics.some(t => t.toLowerCase() === newTopic.toLowerCase())) {
                setActiveTopics(prev => [...prev, newTopic]);
            }
            setInputValue('');
        }
    };

    const handleToggleTag = (tag: string) => {
        const lowerTag = tag.toLowerCase();
        if (activeTopics.some(t => t.toLowerCase() === lowerTag)) {
            removeTopicChip(tag);
        } else {
            setActiveTopics(prev => [...prev, tag]);
        }
    };

    const matchingTags = POPULAR_TAGS.filter(tag =>
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !activeTopics.some(t => t.toLowerCase() === tag.toLowerCase())
    );

    return (
        <div className="w-72 shrink-0 h-[calc(100vh-4rem)] sticky top-16 border-l border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#111d2e]/50 backdrop-blur-sm p-4 overflow-y-auto hidden md:flex flex-col gap-6">

            {/* Search Input */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Topic Filters</h3>
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
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Page Topics</h3>
                    {/* Queue All Action (Only show if there are active selections) */}
                    {activeTopics.length > 0 && (
                        <button
                            onClick={onQueueAll}
                            className="flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
                            title="Add all highlighted stories to Queue"
                        >
                            <Layers size={14} />
                            Queue All
                        </button>
                    )}
                </div>

                {/* Custom Active Tags (that aren't in the POPULAR_TAGS list) */}
                {activeTopics.filter(t => !POPULAR_TAGS.some(p => p.toLowerCase() === t.toLowerCase())).length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {activeTopics
                            .filter(topic => !POPULAR_TAGS.some(p => p.toLowerCase() === topic.toLowerCase()))
                            .map(topic => {
                                const color = getTopicColor(topic);
                                return (
                                    <button
                                        key={topic}
                                        onClick={() => handleToggleTag(topic)}
                                        className={`inline-flex items-center gap-1 text-sm font-medium px-2.5 py-1.5 rounded-md border ${color.bg} ${color.text} ${color.border} shadow-sm ring-2 ring-blue-500/40`}
                                        title={`Remove ${topic} filter`}
                                    >
                                        {topic}
                                    </button>
                                );
                            })}
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {Array.from(
                        new Map(
                            [...availableTags, ...activeTopics.filter(t => POPULAR_TAGS.some(p => p.toLowerCase() === t.toLowerCase()))]
                                .map(tag => [tag.toLowerCase(), tag])
                        ).values()
                    )
                        .sort(undefined)
                        .map(tag => {
                            const isActive = activeTopics.some(t => t.toLowerCase() === tag.toLowerCase());
                            const color = getTopicColor(tag);
                            return (
                                <button
                                    key={tag.toLowerCase()}
                                    onClick={() => handleToggleTag(tag)}
                                    className={`inline-flex items-center text-xs font-medium px-2.5 py-1.5 rounded-md border transition-all hover:scale-105 active:scale-95 ${color.bg} ${color.text} ${color.border} ${isActive ? 'ring-2 ring-blue-500/40 shadow-sm' : 'opacity-70 hover:opacity-100'}`}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                </div>
            </div>

            {/* Reading Queue Status (Optional, good for visibility) */}
            <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
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
