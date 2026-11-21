import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Database, Cpu, Terminal, Globe, ArrowRight } from 'lucide-react';
import type { Story } from '../types';
import { fetchWithAuth } from '../utils/api';
import { StoryCard } from './StoryCard';

interface GroupedFeedProps {
    apiBase: string;
    stories: Story[];
    selectedStoryId: number | null;
    highlightedStoryId: number | null;
    readIds: Set<number>;
    hiddenIds: Set<number>;
    activeTopics: string[];
    onSelectStory: (story: Story) => void;
    onOpenInTab: (id: number, mode?: 'article' | 'discussion' | 'split', keepOpen?: boolean, storyOverride?: Story) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    onHide?: (id: number) => void;
    onFilterTopic: (topics: string[]) => void;
    refreshKey?: number;
}

type GroupKey = 'postgres' | 'ai' | 'systems' | 'general';

interface TopicGroup {
    key: GroupKey;
    label: string;
    icon: React.ReactNode;
    accentClass: string;
    badgeClass: string;
    hiddenTags: string[];
    filterTopics?: string[];
    stories: Story[];
}

const DEFAULT_VISIBLE_COUNT = 5;

function isPostgresStory(s: Story): boolean {
    const title = (s.title || '').toLowerCase();
    const url = (s.url || '').toLowerCase();
    const topics = (s.topics || []).map(t => t.toLowerCase());
    if (topics.includes('postgres') || topics.includes('postgresql')) return true;
    return (
        title.includes('postgres') ||
        title.includes('pgvector') ||
        title.includes('pg_') ||
        title.includes('psql') ||
        title.includes('postgis') ||
        title.includes('pglite') ||
        url.includes('postgres')
    );
}

function isAIStory(s: Story): boolean {
    const title = (s.title || '').toLowerCase();
    const topics = (s.topics || []).map(t => t.toLowerCase());
    if (topics.some(t => ['llm', 'ai', 'model', 'ml', 'machine learning', 'agents'].includes(t))) {
        return true;
    }
    return (
        /\b(llm|llms|ai|gpt|claude|gemini|openai|anthropic|ollama|llama|qwen|deepseek|vllm|litert|gemma|mcp)\b/i.test(title) ||
        title.includes('coding agent') ||
        title.includes('neural') ||
        title.includes('transformer')
    );
}

function isSystemsOrDBStory(s: Story): boolean {
    const title = (s.title || '').toLowerCase();
    const topics = (s.topics || []).map(t => t.toLowerCase());
    if (topics.some(t => ['database', 'databases', 'sqlite', 'duckdb', 'linux', 'rust', 'go', 'systems', 'kernel', 'security', 'performance', 'c', 'c++', 'distributed systems'].includes(t))) {
        return true;
    }
    return /\b(sqlite|duckdb|mysql|clickhouse|redis|kafka|linux|kernel|rust|golang|ebpf|wasm|compiler|database|storage engine)\b/i.test(title);
}

export const GroupedFeed: React.FC<GroupedFeedProps> = ({
    apiBase,
    stories,
    selectedStoryId,
    highlightedStoryId,
    readIds,
    hiddenIds,
    activeTopics,
    onSelectStory,
    onOpenInTab,
    onToggleSave,
    onHide,
    onFilterTopic,
    refreshKey = 0,
}) => {
    const [pgStories, setPgStories] = useState<Story[]>([]);
    const [aiStories, setAiStories] = useState<Story[]>([]);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem('hn_collapsed_groups');
            if (saved) return JSON.parse(saved);
        } catch { }
        return {};
    });
    const [expandedCounts, setExpandedCounts] = useState<Record<string, boolean>>({});

    const toggleGroup = useCallback((key: GroupKey) => {
        setCollapsedGroups(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem('hn_collapsed_groups', JSON.stringify(next));
            } catch { }
            return next;
        });
    }, []);

    // Fetch latest Postgres & AI/LLM slices in parallel so top priority groups are always rich and fresh
    useEffect(() => {
        if (!apiBase) return;
        let cancelled = false;
        Promise.all([
            fetchWithAuth(`${apiBase}/api/stories?limit=20&sort=latest&topic=Postgres`, { credentials: 'include' })
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null),
            fetchWithAuth(`${apiBase}/api/stories?limit=20&sort=latest&topic=LLM&topic=AI&topic_match=any`, { credentials: 'include' })
                .then(r => (r.ok ? r.json() : null))
                .catch(() => null),
        ]).then(([pgData, aiData]) => {
            if (cancelled) return;
            if (pgData?.stories) setPgStories(pgData.stories);
            if (aiData?.stories) setAiStories(aiData.stories);
        });
        return () => { cancelled = true; };
    }, [apiBase, refreshKey]);

    const groups: TopicGroup[] = useMemo(() => {
        const seen = new Set<number>();
        const pgBucket: Story[] = [];
        const aiBucket: Story[] = [];
        const sysBucket: Story[] = [];
        const genBucket: Story[] = [];

        // Keep freshest summary/saved state from main stories buffer when available
        const mainById = new Map<number, Story>();
        for (const s of stories) mainById.set(s.id, s);

        const resolveStory = (s: Story): Story => mainById.get(s.id) || s;
        const isVisible = (s: Story) => !hiddenIds.has(s.id) && !s.is_hidden;

        // 1. Priority #1: Postgres (from dedicated slice + any front-page PG stories)
        for (const raw of [...pgStories, ...stories]) {
            const s = resolveStory(raw);
            if (!isVisible(s) || seen.has(s.id)) continue;
            if (isPostgresStory(s)) {
                seen.add(s.id);
                pgBucket.push(s);
            }
        }

        // 2. Priority #2: AI & LLMs (from dedicated slice + any front-page AI stories)
        for (const raw of [...aiStories, ...stories]) {
            const s = resolveStory(raw);
            if (!isVisible(s) || seen.has(s.id)) continue;
            if (isAIStory(s)) {
                seen.add(s.id);
                aiBucket.push(s);
            }
        }

        // 3. Priority #3: Systems & Databases + Priority #4: General HN
        for (const s of stories) {
            if (!isVisible(s) || seen.has(s.id)) continue;
            seen.add(s.id);
            if (isSystemsOrDBStory(s)) {
                sysBucket.push(s);
            } else {
                genBucket.push(s);
            }
        }

        const allGroups: TopicGroup[] = [
            {
                key: 'postgres',
                label: 'Postgres',
                icon: <Database size={14} />,
                accentClass: 'text-sky-600 dark:text-sky-400',
                badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/25',
                hiddenTags: ['Postgres', 'PostgreSQL', 'Database'],
                filterTopics: ['Postgres'],
                stories: pgBucket,
            },
            {
                key: 'ai',
                label: 'AI & LLMs',
                icon: <Cpu size={14} />,
                accentClass: 'text-indigo-600 dark:text-indigo-400',
                badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border-indigo-500/25',
                hiddenTags: ['AI', 'LLM'],
                filterTopics: ['AI', 'LLM'],
                stories: aiBucket,
            },
            {
                key: 'systems',
                label: 'Systems & Databases',
                icon: <Terminal size={14} />,
                accentClass: 'text-emerald-600 dark:text-emerald-400',
                badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/25',
                hiddenTags: [],
                filterTopics: ['Database'],
                stories: sysBucket,
            },
            {
                key: 'general',
                label: 'General HN',
                icon: <Globe size={14} />,
                accentClass: 'text-slate-600 dark:text-slate-400',
                badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25',
                hiddenTags: [],
                stories: genBucket,
            },
        ];

        return allGroups.filter(g => g.stories.length > 0);
    }, [pgStories, aiStories, stories, hiddenIds]);

    // Ensure the very first story in the top group is highlighted if nothing is highlighted yet
    useEffect(() => {
        if (!highlightedStoryId && groups.length > 0 && groups[0].stories.length > 0) {
            onSelectStory(groups[0].stories[0]);
        }
    }, [highlightedStoryId, groups, onSelectStory]);

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-6 bg-[#f8fafc] dark:bg-[#131824]">
            {groups.map(group => {
                const isCollapsed = Boolean(collapsedGroups[group.key]);
                const isExpanded = Boolean(expandedCounts[group.key]);
                const visibleStories = isExpanded ? group.stories : group.stories.slice(0, DEFAULT_VISIBLE_COUNT);
                const hiddenCount = group.stories.length - visibleStories.length;

                return (
                    <section key={group.key} className="space-y-2">
                        {/* Section Header */}
                        <div className="flex items-center justify-between px-1 select-none">
                            <button
                                onClick={() => toggleGroup(group.key)}
                                className="flex items-center gap-2 group/hdr cursor-pointer focus:outline-none"
                            >
                                <span className="text-slate-400 group-hover/hdr:text-slate-600 dark:group-hover/hdr:text-slate-200 transition-colors">
                                    {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                                </span>
                                <span className={group.accentClass}>{group.icon}</span>
                                <h2 className="text-[13px] font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
                                    {group.label}
                                </h2>
                                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${group.badgeClass}`}>
                                    {group.stories.length}
                                </span>
                            </button>

                            {group.filterTopics && (
                                <button
                                    onClick={() => onFilterTopic(group.filterTopics!)}
                                    className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors cursor-pointer"
                                >
                                    <span>View all</span>
                                    <ArrowRight size={12} />
                                </button>
                            )}
                        </div>

                        {/* Section Stories */}
                        {!isCollapsed && (
                            <div className="space-y-1.5">
                                {visibleStories.map((story, idx) => (
                                    <StoryCard
                                        key={story.id}
                                        story={story}
                                        index={idx}
                                        isSelected={selectedStoryId === story.id}
                                        isHighlighted={highlightedStoryId === story.id}
                                        isRead={readIds.has(story.id) || !!story.is_read}
                                        onSelect={() => onSelectStory(story)}
                                        onOpenInTab={onOpenInTab}
                                        onToggleSave={onToggleSave}
                                        onHide={onHide}
                                        activeTopics={activeTopics}
                                        hiddenTags={group.hiddenTags}
                                    />
                                ))}

                                {hiddenCount > 0 && (
                                    <button
                                        onClick={() => setExpandedCounts(prev => ({ ...prev, [group.key]: true }))}
                                        className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100/70 dark:bg-[#161d2e] hover:bg-slate-200/60 dark:hover:bg-[#1a2234] border border-dashed border-slate-200 dark:border-slate-800 rounded-xl transition-colors cursor-pointer"
                                    >
                                        + Show {hiddenCount} more {group.label} {hiddenCount === 1 ? 'story' : 'stories'}
                                    </button>
                                )}

                                {isExpanded && group.stories.length > DEFAULT_VISIBLE_COUNT && (
                                    <button
                                        onClick={() => setExpandedCounts(prev => ({ ...prev, [group.key]: false }))}
                                        className="w-full py-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
                                    >
                                        Show less
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
};
