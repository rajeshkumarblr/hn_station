import { useState, useEffect } from 'react';
import { Bookmark, Check, Link, Terminal, ExternalLink, Columns, X, Sparkles } from 'lucide-react';
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
    onOpenInTab?: (id: number, mode: 'article' | 'discussion' | 'split') => void;
    onSummarize?: (id: number) => void;
    isSelected?: boolean;
    isHighlighted?: boolean;
    isRead?: boolean;
    isEven?: boolean;
    activeTopics?: string[];
    selectedTopics?: string[];
    topicMatch?: 'any' | 'all' | 'exclusive';
}






// A tag that shows as plain #hashtag text, lights up with its color when clicked



export function StoryCard({
    story, index, onSelect, onToggleSave, onHide, onOpenInTab,
    isSelected, isHighlighted, isRead, isEven, activeTopics = [], selectedTopics = [],
    topicMatch = 'any'
}: StoryCardProps) {
    let domain = '';
    try {
        if (story.url) {
            domain = new URL(story.url).hostname.replace(/^www\./, '');
        }
    } catch (e) {
        // ignore invalid urls
    }

    const [isCopied, setIsCopied] = useState(false);
    const handleCopyLink = (e: React.MouseEvent) => {
        e.stopPropagation();
        const urlToCopy = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
        navigator.clipboard.writeText(urlToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };



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
            setVoteError("Set HN login in settings");
            setTimeout(() => setVoteError(null), 3000);
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
                    how: direction
                })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || `Failed to ${direction}vote`);
            }

            setVoted(direction);
            setLocalScore(prev => direction === 'up' ? prev + 1 : prev - 1);
        } catch (err: any) {
            setVoteError(err.message || 'Error voting');
            setTimeout(() => setVoteError(null), 3000);
        } finally {
            setVoting(false);
        }
    };

    const dimmed = story.is_read || isRead;
    const saved = story.is_saved || false;


    const [contextMenuPos, setContextMenuPos] = useState<{ x: number, y: number } | null>(null);

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

    // Focus (keyboard/hover) vs Selection (open tab)
    // We want the current focus to be the most prominent.
    // Fallback: If no topic match, check if title contains the active topic keyword


    // Unified card styling with hover lifting effect and alternating colors
    const cardBg = isEven
        ? 'bg-white dark:bg-[#11192e] border-slate-200 dark:border-slate-800/60 shadow-sm'
        : 'bg-slate-50/40 dark:bg-[#0a0f1d] border-slate-100 dark:border-slate-900/50';

    const activeBg = isHighlighted
        ? `backdrop-blur-md bg-lime-500/5 dark:bg-[#182845] border-l-[3px] border-l-lime-500 border-y border-r border-y-lime-500/20 border-r-lime-500/10 shadow-xl shadow-lime-500/10 z-10 ring-1 ring-lime-500/20 animate-pulse-subtle`
        : isSelected
            ? `backdrop-blur-md bg-orange-500/5 dark:bg-[#1b2b4a] border-l-[3px] border-l-orange-500 shadow-md`
            : `backdrop-blur-md ${cardBg} border hover:border-orange-500/30 dark:hover:border-orange-500/30 hover:bg-white dark:hover:bg-[#162744] hover:shadow-xl hover:shadow-orange-500/5 hover:-translate-y-0.5`;

    // Compute time-ago for the story
    const timeAgo = (() => {
        if (!story.time) return '';
        const d = new Date(story.time);
        const s = Math.floor((Date.now() - d.getTime()) / 1000);
        if (s > 86400) return Math.floor(s / 86400) + 'd';
        if (s > 3600) return Math.floor(s / 3600) + 'h';
        if (s > 60) return Math.floor(s / 60) + 'm';
        return s + 's';
    })();

    return (
        <div
            id={`story-${story.id}`}
            className={`group transition-all duration-300 flex flex-col justify-center relative ${isWebPreview() ? 'rounded-xl px-4 py-2' : 'rounded-2xl px-5 py-4'} animate-slide-in ${activeBg}`}
            style={{ animationDelay: `${(index !== undefined ? index % 10 : 0) * 0.05}s` }}
            onClick={() => onSelect && onSelect(story.id)}
            onContextMenu={handleContextMenu}
        >
            {/* Inline Actions Row - Prominent & Discoverable below title */}
            <div className="relative z-10">
                <div className="flex items-start gap-3">
                    <div className="flex-1">
                        <h3 className="text-[15px] leading-snug mb-1 font-bold whitespace-normal transition-all duration-200">
                            <span
                                className={`hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer ${isHighlighted ? 'text-amber-600 dark:text-amber-400' : ''} ${!isHighlighted ? (dimmed && !isSelected ? 'text-slate-400 dark:text-slate-500 font-normal' : 'text-slate-800 dark:text-slate-100') : ''}`}
                            >
                                {story.title}
                            </span>
                        </h3>

                        {/* Compact Metadata Row */}
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium pr-28">
                            {story.by && (
                                <span className="font-bold text-orange-600/70 dark:text-[#ff6600]/70">{story.by}</span>
                            )}
                            {timeAgo && (
                                <span className="text-slate-400/80 dark:text-slate-500/80">{timeAgo}</span>
                            )}
                            {(story.by || timeAgo) && (domain || (!domain && story.title.startsWith('Ask HN'))) && (
                                <span className="text-slate-300 dark:text-slate-700">·</span>
                            )}
                            {domain && (
                                <div className="flex items-center gap-1.5">
                                    <img
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                        alt=""
                                        className="w-3.5 h-3.5 rounded-sm grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <span className="truncate max-w-[120px] text-slate-400 dark:text-slate-400 font-bold">{domain}</span>
                                </div>
                            )}
                            {!domain && story.title.startsWith('Ask HN') && (
                                <div className="flex items-center gap-1 text-indigo-500/70">
                                    <Terminal size={10} />
                                    <span>Ask HN</span>
                                </div>
                            )}
                            <div className="relative flex items-center shrink-0">
                                <div className="flex items-center gap-0.5 bg-slate-100/50 dark:bg-slate-800/30 rounded px-1.5 py-0.5 border border-slate-200/20 dark:border-slate-800/40">
                                    <button
                                        onClick={(e) => handleVote(e, 'up')}
                                        disabled={voting}
                                        title="Upvote story"
                                        className={`transition-colors p-0.5 rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50 ${voted === 'up' ? 'text-orange-500' : 'text-slate-400 hover:text-orange-500'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                    </button>
                                    <span className={`text-[11px] font-black select-none px-0.5 ${voted === 'up' ? 'text-orange-500' : voted === 'down' ? 'text-blue-500' : 'text-amber-500 dark:text-amber-400'}`}>
                                        {localScore}
                                    </span>
                                    <button
                                        onClick={(e) => handleVote(e, 'down')}
                                        disabled={voting}
                                        title="Downvote story"
                                        className={`transition-colors p-0.5 rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50 ${voted === 'down' ? 'text-blue-500' : 'text-slate-400 hover:text-blue-500'}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                    </button>
                                </div>
                                {voteError && (
                                    <div className="absolute bottom-full mb-1.5 left-1/2 transform -translate-x-1/2 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[100] animate-in fade-in zoom-in-95 duration-150">
                                        {voteError}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onSelect && onSelect(story.id); }}
                                className={`flex items-center gap-0.5 transition-colors font-bold ${story.descendants > 0 ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                {story.descendants > 0 ? story.descendants : ''}
                            </button>

                            {/* Promoted Topic Tags (Filter Matches Only) */}
                            {story.topics && story.topics.length > 0 && (
                                <div className="flex items-center gap-1.5 ml-1">
                                    {(() => {
                                        // Exclusive mode: only show the ones that match selection
                                        // Other modes: show all active toolbar topics that apply
                                        const filterBase = (topicMatch === 'exclusive' && selectedTopics.length > 0) ? selectedTopics : activeTopics;
                                        
                                        // Unique set of matched filter labels to display
                                        const matchedLabels = new Set<string>();
                                        
                                        story.topics.forEach(t => {
                                            const tLow = t.toLowerCase();
                                            filterBase.forEach(f => {
                                                const fLow = f.toLowerCase();
                                                // Check direct, plural, or common synonyms (LLM/Language Model)
                                                const isMatch = tLow === fLow || 
                                                               tLow === fLow + 's' || 
                                                               fLow === tLow + 's' ||
                                                               (fLow === 'llm' && tLow === 'language models') ||
                                                               (fLow === 'llm' && tLow === 'language model');
                                                if (isMatch) matchedLabels.add(f);
                                            });
                                        });

                                        return Array.from(matchedLabels).slice(0, 3).map(label => {
                                            const style = getTagStyle(label);
                                            return (
                                                <span 
                                                    key={label}
                                                    className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tight border shadow-sm"
                                                    style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
                                                >
                                                    #{label}
                                                </span>
                                            );
                                        });
                                    })()}
                                </div>
                            )}

                            {/* 1-line AI Summary Preview */}
                            {story.summary && story.summary.trim().length > 0 && !isWebPreview() && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 line-clamp-1 italic leading-relaxed">
                                    <Sparkles size={10} className="inline mr-1 text-indigo-400/60" />
                                    {story.summary
                                        .replace(/^([#\s\-*•]|\d+\.)+/, '')
                                        .replace(/^\*\*|\*\*$/g, '')
                                        .split('\n')[0]
                                        .replace(/^([#\s\-*•]|\d+\.)+/, '')
                                        .replace(/^\*\*|\*\*$/g, '')
                                        .trim()
                                        .slice(0, 120)}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sleek Action Icons in the Bottom-Right Corner */}
            <div className="absolute bottom-2 right-3 flex items-center gap-1 z-20">
                {!isWebPreview() && onOpenInTab && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'split'); }}
                        className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Open in Tab"
                    >
                        <Columns size={12} />
                    </button>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); (window as any).electronAPI ? (window as any).electronAPI.openExternal(story.url) : window.open(story.url, '_blank'); }}
                    className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-355 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Open Website in Browser"
                >
                    <ExternalLink size={12} />
                </button>

                <button
                    onClick={(e) => { handleCopyLink(e); }}
                    className={`p-1 rounded transition-colors ${isCopied ? 'text-green-500 bg-green-50 dark:bg-green-950/20' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-355 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title={isCopied ? 'Copied!' : 'Copy Link'}
                >
                    {isCopied ? <Check size={12} /> : <Link size={12} />}
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); if (onToggleSave) onToggleSave(story.id, !saved); }}
                    className={`p-1 rounded transition-colors ${saved
                        ? 'text-amber-500 bg-amber-50/80 dark:bg-amber-500/10'
                        : onToggleSave 
                            ? 'text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-200 dark:text-slate-800 cursor-not-allowed'
                    }`}
                    title={!onToggleSave ? 'Login to bookmark' : saved ? 'Unbookmark' : 'Bookmark'}
                >
                    <Bookmark size={12} fill={saved ? "currentColor" : "none"} />
                </button>

                {onHide && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(story.id); }}
                        className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors hover:bg-red-50/30 dark:hover:bg-red-950/10"
                        title="Hide Story"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>


            {/* Context Menu Popup */}
            {contextMenuPos && onOpenInTab && (
                <div
                    className="fixed z-[10000] w-[22rem] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl py-1 text-sm text-slate-700 dark:text-slate-200 animate-in fade-in duration-100"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                >
                    {isWebPreview() ? (
                        <>
                            <button
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    if (story.url) window.open(story.url, '_blank');
                                    onOpenInTab(story.id, 'discussion'); 
                                    setContextMenuPos(null); 
                                }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 font-semibold text-blue-600 dark:text-blue-400"
                            >
                                📖 Open Article & Discussion Comments
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'discussion'); setContextMenuPos(null); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 font-medium"
                            >
                                💬 Open Discussion Comments
                            </button>
                            {story.url && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); window.open(story.url, '_blank'); setContextMenuPos(null); }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium"
                                >
                                    ↗ Open Article in New Tab
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'split'); setContextMenuPos(null); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 font-semibold text-blue-600 dark:text-blue-400"
                            >
                                📖 Show article and discussion side by side
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'article'); setContextMenuPos(null); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium border-b border-slate-100 dark:border-slate-800"
                            >
                                📄 Open Story Tab
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'discussion'); setContextMenuPos(null); }}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-700 dark:text-slate-200 font-medium"
                            >
                                💬 Open Discussion Tab
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
