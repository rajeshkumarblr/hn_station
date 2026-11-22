import { useState, useEffect, useRef } from 'react';
import { Bookmark, X, MessageSquare } from 'lucide-react';
import { isWebPreview } from '../utils/env';
import { getApiBase } from '../utils/apiBase';

export interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string; // ISO string from backend
    created_at: string;
    hn_rank?: number;
    is_read?: boolean;
    is_saved?: boolean;
    summary?: string;
    topics?: string[];
}

interface StoryCardProps {
    story: Story;
    index?: number;
    onSelect?: (id: number) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    onHide?: (id: number) => void;
    onOpenInTab?: (id: number, mode?: 'article' | 'discussion' | 'split', keepOpen?: boolean, storyOverride?: Story) => void;
    onSummarize?: (id: number) => void;
    isSelected?: boolean;
    isHighlighted?: boolean;
    isRead?: boolean;
    isEven?: boolean;
    indented?: boolean;
    activeTopics?: string[];
    selectedTopics?: string[];
    topicMatch?: 'any' | 'all' | 'exclusive';
    hiddenTags?: string[];
}

function matchesWholeWord(text: string, term: string): boolean {
    if (!text || !term) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export function StoryCard({
    story, onSelect, onToggleSave, onHide, onOpenInTab,
    isSelected, isHighlighted, isRead, indented = false, activeTopics = [], hiddenTags = [],
}: StoryCardProps) {
    const hoverTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        };
    }, []);

    const hiddenLower = new Set(hiddenTags.map(t => t.toLowerCase()));
    const displayTopics = (() => {
        const seen = new Set<string>();
        const result: string[] = [];
        const title = story.title || '';
        for (const t of activeTopics) {
            const lower = t?.toLowerCase();
            if (t && lower && !hiddenLower.has(lower) && matchesWholeWord(title, lower) && !seen.has(lower)) {
                seen.add(lower);
                result.push(t);
            }
        }
        if (story.topics) {
            for (const t of story.topics) {
                const lower = t?.toLowerCase();
                if (t && lower && !hiddenLower.has(lower) && !seen.has(lower)) {
                    seen.add(lower);
                    result.push(t);
                }
            }
        }
        return result.slice(0, 2);
    })();

    let domain = '';
    try {
        if (story.url) {
            domain = new URL(story.url).hostname.replace(/^www\./, '');
        }
    } catch {
        // ignore invalid urls
    }

    const [voted, setVoted] = useState<'up' | 'down' | null>(null);
    const [localScore, setLocalScore] = useState(story.score);
    const [voteError, setVoteError] = useState<string | null>(null);
    const [voting, setVoting] = useState(false);

    useEffect(() => {
        setLocalScore(story.score);
    }, [story.score]);

    const handleVote = async (e: React.MouseEvent, direction: 'up' | 'down') => {
        e.stopPropagation();
        if (voting) return;

        const hnUsername = localStorage.getItem('hn_username');
        const hnPassword = localStorage.getItem('hn_password');

        if (!hnUsername || !hnPassword) {
            setVoteError('Set HN login in settings');
            setTimeout(() => setVoteError(null), 2500);
            return;
        }

        setVoting(true);
        setVoteError(null);

        try {
            const res = await fetch(`${getApiBase()}/api/hn/interact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: hnUsername,
                    password: hnPassword,
                    action: 'vote',
                    item_id: story.id,
                    how: direction,
                }),
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `Failed to ${direction}vote`);
            }

            setVoted(direction);
            setLocalScore(prev => (direction === 'up' ? prev + 1 : prev - 1));
        } catch (err: any) {
            setVoteError(err.message || 'Error voting');
            setTimeout(() => setVoteError(null), 2500);
        } finally {
            setVoting(false);
        }
    };

    const dimmed = story.is_read || isRead;
    const saved = story.is_saved || false;

    const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

    const handleContextMenu = (e: React.MouseEvent) => {
        if (!onOpenInTab) return;
        e.preventDefault();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
    };

    useEffect(() => {
        if (!contextMenuPos) return;
        const closeMenu = () => setContextMenuPos(null);
        window.addEventListener('click', closeMenu);
        return () => window.removeEventListener('click', closeMenu);
    }, [contextMenuPos]);

    const timeAgo = (() => {
        const ts = (story as any).posted_at || story.time || story.created_at;
        if (!ts) return '';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
        if (s >= 86400) return Math.floor(s / 86400) + 'd';
        if (s >= 3600) return Math.floor(s / 3600) + 'h';
        if (s >= 60) return Math.floor(s / 60) + 'm';
        return s + 's';
    })();

    const cleanSummaryLine = story.summary && story.summary.trim().length > 0
        ? story.summary
              .replace(/^([#\s\-*•]|\d+\.)+/, '')
              .replace(/\*\*/g, '')
              .split('\n')[0]
              .replace(/^([#\s\-*•]|\d+\.)+/, '')
              .trim()
              .slice(0, 160)
        : '';

    const handleCardClick = () => {
        onSelect?.(story.id);
        if (!isWebPreview() && onOpenInTab) {
            onOpenInTab(story.id, story.url ? 'article' : 'discussion', false, story);
        }
    };

    const handleMouseEnter = () => {
        if (!onSelect || isHighlighted) return;
        hoverTimerRef.current = window.setTimeout(() => {
            onSelect(story.id);
        }, 140);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    const isActiveRow = isHighlighted || isSelected;

    return (
        <div
            id={`story-${story.id}`}
            className={`group relative ${indented ? 'pl-10 pr-6' : 'px-6'} py-3.5 cursor-pointer transition-colors duration-100 border-b border-stone-200/75 dark:border-white/[0.06] ${
                isActiveRow
                    ? 'bg-stone-200/45 dark:bg-white/[0.045]'
                    : 'hover:bg-stone-100/70 dark:hover:bg-white/[0.025]'
            }`}
            onClick={handleCardClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
        >
            {/* Subtle Left Accent Bar for Active Preview Row */}
            {isActiveRow && (
                <div className={`absolute ${indented ? 'left-4' : 'left-0'} top-2.5 bottom-2.5 w-[2px] rounded-full bg-[#e06834]`} />
            )}

            <div className="relative pr-14">
                {/* Headline */}
                <h3 className="text-[15px] leading-[1.38] tracking-[-0.012em] whitespace-normal">
                    <span
                        className={`transition-colors ${
                            dimmed && !isActiveRow
                                ? 'text-stone-500 dark:text-zinc-400 font-normal'
                                : 'text-stone-900 dark:text-[#ececef] font-medium group-hover:text-black dark:group-hover:text-white'
                        }`}
                    >
                        {story.title}
                    </span>
                </h3>

                {/* Quiet 1-Line Takeaway Subtitle (always softer than headline, including when read) */}
                {cleanSummaryLine && !isWebPreview() && (
                    <p
                        className={`text-[13px] mt-1 line-clamp-1 leading-[1.45] font-normal ${
                            dimmed && !isActiveRow
                                ? 'text-stone-400 dark:text-zinc-500'
                                : 'text-stone-500 dark:text-zinc-400'
                        }`}
                    >
                        {cleanSummaryLine}
                    </p>
                )}

                {/* Quiet Single-Line Metadata */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[11.5px] text-stone-400 dark:text-zinc-500">
                    {domain ? (
                        <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-zinc-400">
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                alt=""
                                className="w-3.5 h-3.5 rounded-[3px] opacity-70"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="truncate max-w-[180px]">{domain}</span>
                        </span>
                    ) : story.title.startsWith('Ask HN') ? (
                        <span className="text-stone-500 dark:text-zinc-400">Ask HN</span>
                    ) : null}

                    {domain && <span className="opacity-45">·</span>}

                    {timeAgo && <span>{timeAgo}</span>}

                    {story.by && (
                        <>
                            <span className="opacity-45">·</span>
                            <span>{story.by}</span>
                        </>
                    )}

                    <span className="opacity-45">·</span>

                    {/* Quiet Inline Upvote */}
                    <span className="relative inline-flex items-center">
                        <button
                            onClick={(e) => handleVote(e, 'up')}
                            disabled={voting}
                            title="Upvote story"
                            className={`inline-flex items-center gap-0.5 tabular-nums transition-colors cursor-pointer ${
                                voted === 'up'
                                    ? 'text-[#e06834] font-medium'
                                    : 'text-stone-500 dark:text-zinc-400 hover:text-[#e06834]'
                            }`}
                        >
                            <span className="text-[9px]">▲</span>
                            <span>{localScore}</span>
                        </button>
                        {voteError && (
                            <span className="absolute bottom-full mb-1 left-0 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium px-2 py-0.5 rounded shadow-md whitespace-nowrap z-[100]">
                                {voteError}
                            </span>
                        )}
                    </span>

                    {/* Comment Count (opens directly to Discussion tab) */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (!isWebPreview() && onOpenInTab) {
                                onOpenInTab(story.id, 'discussion', false, story);
                            } else {
                                onSelect?.(story.id);
                            }
                        }}
                        title="Open discussion"
                        className={`inline-flex items-center gap-1 tabular-nums transition-colors hover:text-stone-900 dark:hover:text-zinc-200 cursor-pointer ${
                            story.descendants > 0 ? 'text-stone-500 dark:text-zinc-400' : 'text-stone-400 dark:text-zinc-600'
                        }`}
                    >
                        <MessageSquare size={11} />
                        <span>{story.descendants || 0}</span>
                    </button>

                    {/* Subtle Monochrome Topic Labels */}
                    {displayTopics.length > 0 && (
                        <>
                            <span className="opacity-45">·</span>
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-400 dark:text-zinc-500">
                                {displayTopics.map((label, i) => (
                                    <span key={label}>
                                        {i > 0 && <span className="mr-1.5 opacity-40">/</span>}
                                        {label}
                                    </span>
                                ))}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Minimal Hover-Only Actions: Bookmark & Hide */}
            <div className={`absolute top-3.5 right-4 flex items-center gap-0.5 z-20 transition-opacity duration-100 ${saved ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {onToggleSave && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSave(story.id, !saved); }}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            saved
                                ? 'text-[#e06834]'
                                : 'text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-white/[0.08]'
                        }`}
                        title={saved ? 'Remove bookmark' : 'Bookmark story'}
                    >
                        <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                )}
                {onHide && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(story.id); }}
                        className="p-1.5 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
                        title="Hide story"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* Right-Click Context Menu */}
            {contextMenuPos && onOpenInTab && (
                <div
                    className="fixed z-[10000] w-56 bg-white dark:bg-[#1c1c20] border border-stone-200 dark:border-zinc-800 rounded-lg shadow-xl py-1 text-[12.5px] text-stone-700 dark:text-zinc-200"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => { onOpenInTab(story.id, 'article', true, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.07] font-medium cursor-pointer"
                    >
                        Open &amp; Pin Tab
                    </button>
                    <button
                        onClick={() => { onOpenInTab(story.id, 'discussion', false, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.07] cursor-pointer"
                    >
                        Open Discussion
                    </button>
                    <button
                        onClick={() => { onOpenInTab(story.id, 'split', false, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.07] cursor-pointer"
                    >
                        Open Side-by-Side Split
                    </button>
                    <div className="my-1 border-t border-stone-200 dark:border-zinc-800" />
                    <button
                        onClick={() => {
                            const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
                            (window as any).electronAPI ? (window as any).electronAPI.openExternal(url) : window.open(url, '_blank');
                            setContextMenuPos(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.07] cursor-pointer"
                    >
                        Open in Browser
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(story.url || `https://news.ycombinator.com/item?id=${story.id}`);
                            setContextMenuPos(null);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-white/[0.07] cursor-pointer"
                    >
                        Copy Link
                    </button>
                </div>
            )}
        </div>
    );
}
