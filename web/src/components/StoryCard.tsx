import { useState, useEffect, useRef } from 'react';
import { Bookmark, Terminal, X, Sparkles, MessageSquare } from 'lucide-react';
import { getTagStyle } from '../utils/colors';
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
    activeTopics?: string[];
    selectedTopics?: string[];
    topicMatch?: 'any' | 'all' | 'exclusive';
    hiddenTags?: string[];
}

export function StoryCard({
    story, index, onSelect, onToggleSave, onHide, onOpenInTab,
    isSelected, isHighlighted, isRead, activeTopics = [], hiddenTags = [],
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
        const titleLower = (story.title || '').toLowerCase();
        for (const t of activeTopics) {
            const lower = t?.toLowerCase();
            if (t && lower && !hiddenLower.has(lower) && titleLower.includes(lower) && !seen.has(lower)) {
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
        return result.slice(0, 3);
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

    const cardBg = 'bg-white dark:bg-[#182032] border-slate-200/80 dark:border-slate-800/90';
    const activeBg = isHighlighted
        ? 'bg-amber-50/40 dark:bg-[#1f2940] border-l-[3px] border-l-amber-400 border-y border-r border-y-slate-200/80 border-r-slate-200/80 dark:border-y-slate-700/80 dark:border-r-slate-700/80 shadow-sm z-10'
        : isSelected
            ? 'bg-orange-500/5 dark:bg-[#1d273c] border-l-[3px] border-l-orange-500 border-y border-r border-slate-200 dark:border-slate-700/70'
            : `${cardBg} border hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/70 dark:hover:bg-[#1d273c]`;

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
              .replace(/^\*\*|\*\*$/g, '')
              .split('\n')[0]
              .replace(/^([#\s\-*•]|\d+\.)+/, '')
              .replace(/^\*\*|\*\*$/g, '')
              .trim()
              .slice(0, 150)
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
        }, 160);
    };

    const handleMouseLeave = () => {
        if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    return (
        <div
            id={`story-${story.id}`}
            className={`group transition-all duration-150 flex flex-col justify-center relative rounded-xl px-4 py-2.5 cursor-pointer ${activeBg}`}
            style={{ animationDelay: `${(index !== undefined ? index % 10 : 0) * 0.03}s` }}
            onClick={handleCardClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
        >
            <div className="relative z-10 pr-14">
                {/* Headline */}
                <h3 className="text-[14.5px] leading-snug mb-1 font-semibold whitespace-normal">
                    <span
                        className={`group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors ${
                            isHighlighted
                                ? 'text-amber-600 dark:text-amber-300'
                                : dimmed && !isSelected
                                    ? 'text-slate-500 dark:text-slate-400 font-normal'
                                    : 'text-slate-900 dark:text-slate-100'
                        }`}
                    >
                        {story.title}
                    </span>
                </h3>

                {/* Quiet Single-Line Metadata */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {domain ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                alt=""
                                className="w-3.5 h-3.5 rounded-sm opacity-75"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <span className="truncate max-w-[160px]">{domain}</span>
                        </span>
                    ) : story.title.startsWith('Ask HN') ? (
                        <span className="inline-flex items-center gap-1 text-indigo-500 dark:text-indigo-400 font-medium">
                            <Terminal size={10} />
                            <span>Ask HN</span>
                        </span>
                    ) : null}

                    {domain && <span className="text-slate-300 dark:text-slate-700">·</span>}

                    {timeAgo && <span>{timeAgo}</span>}

                    {story.by && (
                        <>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className="text-slate-500 dark:text-slate-400">{story.by}</span>
                        </>
                    )}

                    <span className="text-slate-300 dark:text-slate-700">·</span>

                    {/* Clean Plain Inline Upvote */}
                    <span className="relative inline-flex items-center">
                        <button
                            onClick={(e) => handleVote(e, 'up')}
                            disabled={voting}
                            title="Upvote story"
                            className={`inline-flex items-center gap-0.5 font-semibold transition-colors cursor-pointer ${
                                voted === 'up'
                                    ? 'text-orange-500'
                                    : 'text-amber-600/90 dark:text-amber-400/90 hover:text-orange-500'
                            }`}
                        >
                            <span>▲</span>
                            <span>{localScore}</span>
                        </button>
                        {voteError && (
                            <span className="absolute bottom-full mb-1 left-0 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[100]">
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
                        className={`inline-flex items-center gap-1 transition-colors font-medium hover:text-orange-500 cursor-pointer ${
                            story.descendants > 0 ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'
                        }`}
                    >
                        <MessageSquare size={11} />
                        <span>{story.descendants || 0}</span>
                    </button>

                    {/* Quiet Muted Topic Tags (non-redundant only) */}
                    {displayTopics.length > 0 && (
                        <div className="inline-flex items-center gap-1.5 ml-1">
                            {displayTopics.map(label => {
                                const style = getTagStyle(label);
                                return (
                                    <span
                                        key={label}
                                        className="text-[10.5px] font-medium opacity-75"
                                        style={{ color: style.color }}
                                    >
                                        #{label}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 1-Line AI Summary Preview */}
                {cleanSummaryLine && !isWebPreview() && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 leading-snug">
                        <Sparkles size={10} className="inline mr-1.5 text-amber-500/80 -mt-0.5" />
                        {cleanSummaryLine}
                    </p>
                )}
            </div>

            {/* Minimal Hover-Only Actions: Bookmark & Hide */}
            <div className={`absolute top-2.5 right-3 flex items-center gap-1 z-20 transition-opacity duration-150 ${saved ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                {onToggleSave && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSave(story.id, !saved); }}
                        className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                            saved
                                ? 'text-amber-500 bg-amber-500/10'
                                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                        }`}
                        title={saved ? 'Remove bookmark' : 'Bookmark story'}
                    >
                        <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
                    </button>
                )}
                {onHide && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(story.id); }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Hide story"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* Right-Click Context Menu */}
            {contextMenuPos && onOpenInTab && (
                <div
                    className="fixed z-[10000] w-64 bg-white dark:bg-[#171f30] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl py-1 text-xs text-slate-700 dark:text-slate-200"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        onClick={() => { onOpenInTab(story.id, 'article', true, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                    >
                        Open &amp; Pin Tab
                    </button>
                    <button
                        onClick={() => { onOpenInTab(story.id, 'discussion', false, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        Open Discussion
                    </button>
                    <button
                        onClick={() => { onOpenInTab(story.id, 'split', false, story); setContextMenuPos(null); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        Open Side-by-Side Split
                    </button>
                    <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
                    <button
                        onClick={() => {
                            const url = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
                            (window as any).electronAPI ? (window as any).electronAPI.openExternal(url) : window.open(url, '_blank');
                            setContextMenuPos(null);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        Open in Browser
                    </button>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(story.url || `https://news.ycombinator.com/item?id=${story.id}`);
                            setContextMenuPos(null);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                        Copy Link
                    </button>
                </div>
            )}
        </div>
    );
}
