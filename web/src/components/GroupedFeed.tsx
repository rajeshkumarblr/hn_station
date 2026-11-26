import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, ArrowRight, RefreshCw, Plus } from 'lucide-react';
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
    focusSort?: 'latest' | 'votes';
    searchQuery?: string;
    onSelectStory: (story: Story) => void;
    onOpenInTab: (id: number, mode?: 'article' | 'discussion' | 'split', keepOpen?: boolean, storyOverride?: Story) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    onHide?: (id: number) => void;
    onFilterTopic: (topics: string[]) => void;
    onAddTopic?: (topic: string) => void;
    refreshKey?: number;
}

interface FocusGroupSpec {
    key: string;
    label: string;
    dotColor: string;
    queryTopics: string[];
    hiddenTags: string[];
    filterTopics: string[];
}

interface TopicGroup extends FocusGroupSpec {
    stories: Story[];
}

const DEFAULT_VISIBLE_COUNT = 5;

const MUTED_TOPIC_COLORS = [
    '#4ea885', // sage teal
    '#d49a45', // muted amber
    '#d6736c', // muted coral
    '#5aa6b0', // slate cyan
    '#c08497', // dusty rose
    '#7b9acc', // steel blue
];

function getMutedTopicColor(topic: string): string {
    const key = topic.trim().toLowerCase();
    if (key === 'postgres' || key === 'postgresql') return '#5b9bd5';
    if (key === 'ai' || key === 'llm' || key === 'ai & llms') return '#9d8df1';
    if (key === 'database' || key === 'databases') return '#4ea885';
    if (key === 'rust') return '#e06834';
    if (key === 'go' || key === 'golang') return '#5aa6b0';
    if (key === 'linux' || key === 'kernel') return '#d49a45';
    if (key === 'security') return '#d6736c';

    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    return MUTED_TOPIC_COLORS[Math.abs(hash) % MUTED_TOPIC_COLORS.length];
}

function buildFocusGroupSpecs(activeTopics: string[]): FocusGroupSpec[] {
    const specs: FocusGroupSpec[] = [];
    const consumed = new Set<string>();
    const lowerMap = new Map<string, string>();
    for (const raw of activeTopics) {
        const clean = raw.trim();
        if (!clean) continue;
        const lower = clean.toLowerCase();
        if (!lowerMap.has(lower)) lowerMap.set(lower, clean);
    }

    // 1. Priority #1: Postgres (if tracked)
    const pgKey = lowerMap.has('postgres') ? 'postgres' : lowerMap.has('postgresql') ? 'postgresql' : null;
    if (pgKey) {
        consumed.add('postgres');
        consumed.add('postgresql');
        specs.push({
            key: 'postgres',
            label: 'Postgres',
            dotColor: '#5b9bd5',
            queryTopics: ['Postgres'],
            hiddenTags: ['Postgres', 'PostgreSQL', 'Database'],
            filterTopics: [lowerMap.get(pgKey)!],
        });
    }

    // 2. Priority #2: Merge AI & LLM into one clean group when both/either are tracked
    const aiTracked: string[] = [];
    if (lowerMap.has('ai')) {
        consumed.add('ai');
        aiTracked.push(lowerMap.get('ai')!);
    }
    if (lowerMap.has('llm')) {
        consumed.add('llm');
        aiTracked.push(lowerMap.get('llm')!);
    }
    if (aiTracked.length > 0) {
        specs.push({
            key: 'ai-llm',
            label: aiTracked.length > 1 ? 'AI & LLMs' : aiTracked[0],
            dotColor: '#9d8df1',
            queryTopics: aiTracked,
            hiddenTags: ['AI', 'LLM'],
            filterTopics: aiTracked,
        });
    }

    // 3. Every other tracked topic in user's order
    for (const raw of activeTopics) {
        const clean = raw.trim();
        const lower = clean.toLowerCase();
        if (!clean || consumed.has(lower)) continue;
        consumed.add(lower);
        specs.push({
            key: `topic-${lower}`,
            label: clean,
            dotColor: getMutedTopicColor(clean),
            queryTopics: [clean],
            hiddenTags: [clean],
            filterTopics: [clean],
        });
    }

    return specs;
}

const STARTER_TOPICS = ['Postgres', 'AI', 'LLM', 'Database', 'Rust', 'Linux'];

export const GroupedFeed: React.FC<GroupedFeedProps> = ({
    apiBase,
    stories,
    selectedStoryId,
    highlightedStoryId,
    readIds,
    hiddenIds,
    activeTopics,
    focusSort = 'latest',
    searchQuery = '',
    onSelectStory,
    onOpenInTab,
    onToggleSave,
    onHide,
    onFilterTopic,
    onAddTopic,
    refreshKey = 0,
}) => {
    const specs = useMemo(() => buildFocusGroupSpecs(activeTopics), [activeTopics]);
    const specsSignature = useMemo(
        () => specs.map(s => `${s.key}:${s.queryTopics.join(',')}`).join('|'),
        [specs]
    );

    const [fetchedByGroup, setFetchedByGroup] = useState<Record<string, Story[]>>({});
    const [loadingGroups, setLoadingGroups] = useState<boolean>(true);
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem('hn_collapsed_groups');
            if (saved) return JSON.parse(saved);
        } catch { }
        return {};
    });
    const [expandedCounts, setExpandedCounts] = useState<Record<string, boolean>>({});

    const toggleGroup = useCallback((key: string) => {
        setCollapsedGroups(prev => {
            const next = { ...prev, [key]: !prev[key] };
            try {
                localStorage.setItem('hn_collapsed_groups', JSON.stringify(next));
            } catch { }
            return next;
        });
    }, []);

    // Fetch stories for every tracked Focus topic in parallel
    useEffect(() => {
        if (!apiBase) return;
        if (specs.length === 0) {
            setFetchedByGroup({});
            setLoadingGroups(false);
            return;
        }

        let cancelled = false;
        setLoadingGroups(true);

        Promise.all(
            specs.map(async spec => {
                const topicParams = spec.queryTopics
                    .map(t => `topic=${encodeURIComponent(t)}`)
                    .join('&');
                const url = `${apiBase}/api/stories?limit=25&sort=${focusSort}&topic_match=any&${topicParams}`;
                try {
                    const res = await fetchWithAuth(url, { credentials: 'include' });
                    if (!res.ok) return [spec.key, [] as Story[]] as const;
                    const data = await res.json();
                    return [spec.key, (data?.stories || []) as Story[]] as const;
                } catch {
                    return [spec.key, [] as Story[]] as const;
                }
            })
        ).then(entries => {
            if (cancelled) return;
            const next: Record<string, Story[]> = {};
            for (const [k, list] of entries) {
                next[k] = list;
            }
            setFetchedByGroup(next);
            setLoadingGroups(false);
        });

        return () => { cancelled = true; };
    }, [apiBase, specsSignature, focusSort, refreshKey]);

    const { populatedGroups, emptyLabels } = useMemo(() => {
        const seen = new Set<number>();
        const mainById = new Map<number, Story>();
        for (const s of stories) mainById.set(s.id, s);

        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = (s: Story) => {
            if (!q) return true;
            return (
                (s.title || '').toLowerCase().includes(q) ||
                (s.summary || '').toLowerCase().includes(q) ||
                (s.url || '').toLowerCase().includes(q) ||
                (s.by || '').toLowerCase().includes(q)
            );
        };

        const isVisible = (s: Story) => !hiddenIds.has(s.id) && !s.is_hidden;
        const populated: TopicGroup[] = [];
        const empty: string[] = [];

        for (const spec of specs) {
            const rawList = fetchedByGroup[spec.key] || [];
            const bucket: Story[] = [];
            for (const raw of rawList) {
                const s = mainById.get(raw.id) || raw;
                if (!isVisible(s) || seen.has(s.id) || !matchesSearch(s)) continue;
                seen.add(s.id);
                bucket.push(s);
            }
            if (bucket.length > 0) {
                populated.push({ ...spec, stories: bucket });
            } else {
                empty.push(spec.label);
            }
        }

        return { populatedGroups: populated, emptyLabels: empty };
    }, [specs, fetchedByGroup, stories, hiddenIds, searchQuery]);

    // Ensure preview pane always tracks a story inside the current Focus groups
    useEffect(() => {
        if (populatedGroups.length === 0 || populatedGroups[0].stories.length === 0) return;
        const alreadyInFocus = highlightedStoryId != null &&
            populatedGroups.some(g => g.stories.some(s => s.id === highlightedStoryId));
        if (!alreadyInFocus) {
            onSelectStory(populatedGroups[0].stories[0]);
        }
    }, [highlightedStoryId, populatedGroups, onSelectStory]);

    if (specs.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-[#fafaf8] dark:bg-[#121214]">
                <h3 className="text-[15px] font-semibold text-stone-800 dark:text-zinc-200 mb-1.5">
                    Pick topics to follow in Focus mode
                </h3>
                <p className="text-[13px] text-stone-500 dark:text-zinc-400 max-w-sm mb-5">
                    Add topics above or start with a few below to build your personalized briefing.
                </p>
                {onAddTopic && (
                    <div className="flex flex-wrap justify-center gap-2">
                        {STARTER_TOPICS.map(topic => (
                            <button
                                key={topic}
                                onClick={() => onAddTopic(topic)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-medium bg-stone-200/70 dark:bg-white/[0.06] text-stone-700 dark:text-zinc-300 hover:bg-stone-200 dark:hover:bg-white/[0.12] transition-colors cursor-pointer"
                            >
                                <Plus size={12} />
                                <span>{topic}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (loadingGroups && populatedGroups.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center p-20 bg-[#fafaf8] dark:bg-[#121214]">
                <RefreshCw size={20} className="animate-spin text-stone-400 dark:text-zinc-500" />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#fafaf8] dark:bg-[#121214]">
            {populatedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-center text-[13px] text-stone-400 dark:text-zinc-500">
                    {searchQuery.trim()
                        ? `No stories matching "${searchQuery.trim()}" in your focus topics.`
                        : 'No recent stories found for your selected focus topics yet.'}
                </div>
            ) : (
                populatedGroups.map(group => {
                    const isCollapsed = Boolean(collapsedGroups[group.key]);
                    const isExpanded = Boolean(expandedCounts[group.key]);
                    const visibleStories = isExpanded ? group.stories : group.stories.slice(0, DEFAULT_VISIBLE_COUNT);
                    const hiddenCount = group.stories.length - visibleStories.length;

                    return (
                        <section key={group.key} className="relative">
                            {/* Distinct Elevated Sticky Section Band */}
                            <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 bg-[#f0f0ec]/95 dark:bg-[#19191d]/95 backdrop-blur-sm border-b border-stone-200/90 dark:border-white/[0.08] select-none">
                                <button
                                    onClick={() => toggleGroup(group.key)}
                                    className="flex items-center gap-2.5 group/hdr cursor-pointer focus:outline-none"
                                >
                                    <span className="text-stone-400 dark:text-zinc-500 group-hover/hdr:text-stone-800 dark:group-hover/hdr:text-zinc-200 transition-colors">
                                        {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                                    </span>
                                    <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: group.dotColor }}
                                    />
                                    <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-stone-900 dark:text-zinc-100">
                                        {group.label}
                                    </h2>
                                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-stone-200/80 dark:bg-white/[0.07] text-stone-600 dark:text-zinc-400 tabular-nums leading-none">
                                        {group.stories.length}
                                    </span>
                                </button>

                                <button
                                    onClick={() => onFilterTopic(group.filterTopics)}
                                    className="flex items-center gap-1 text-[11.5px] font-medium text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                                >
                                    <span>View all</span>
                                    <ArrowRight size={11} />
                                </button>
                            </div>

                            {/* Indented Child Story List with Subtle Vertical Structural Guide */}
                            {!isCollapsed && (
                                <div className="relative pb-2">
                                    <div
                                        className="pointer-events-none absolute left-[22px] top-0 bottom-2 w-px opacity-30 dark:opacity-25"
                                        style={{ backgroundColor: group.dotColor }}
                                    />
                                    {visibleStories.map((story, idx) => (
                                        <StoryCard
                                            key={story.id}
                                            story={story}
                                            index={idx}
                                            indented={true}
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
                                            className="w-full text-left pl-10 pr-6 py-2.5 text-[12px] font-medium text-stone-400 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-100/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
                                        >
                                            Show {hiddenCount} more in {group.label}
                                        </button>
                                    )}

                                    {isExpanded && group.stories.length > DEFAULT_VISIBLE_COUNT && (
                                        <button
                                            onClick={() => setExpandedCounts(prev => ({ ...prev, [group.key]: false }))}
                                            className="w-full text-left pl-10 pr-6 py-2 text-[12px] font-medium text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
                                        >
                                            Show less
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>
                    );
                })
            )}

            {/* Quiet footer listing tracked topics with no recent matches */}
            {!loadingGroups && emptyLabels.length > 0 && populatedGroups.length > 0 && (
                <div className="px-6 py-5 text-[11.5px] text-stone-400 dark:text-zinc-500">
                    No recent stories for: {emptyLabels.join(', ')}
                </div>
            )}
        </div>
    );
};
