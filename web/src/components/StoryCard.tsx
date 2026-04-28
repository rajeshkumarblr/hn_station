import { useState, useEffect } from 'react';
import { Bookmark, Check, Link, Terminal, ExternalLink, Columns, X, Sparkles } from 'lucide-react';

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
    topicTextClass?: string | null;
    titleColorStyle?: string | null; // inline CSS color for the title
    activeTopics?: string[];
    onTopicClick?: (topic: string) => void;
}




export function getTagStyle(tag: string): { color: string; bg: string; border: string } {
    // Deterministic unique HSL color from tag name
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Spread hues evenly, keep saturation/lightness readable
    const hue = Math.abs(hash) % 360;
    const sat = 60 + (Math.abs(hash >> 8) % 20); // 60-80%
    const lit = 55 + (Math.abs(hash >> 16) % 10); // 55-65%
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    const bg = `hsla(${hue}, ${sat}%, ${lit}%, 0.12)`;
    const border = `hsl(${hue}, ${sat}%, ${lit}%)`;
    return { color, bg, border };
}

// Legacy Tailwind alias — kept for any external consumers
export function getTagColor(tag: string) {
    const s = getTagStyle(tag);
    return { bg: '', text: '', border: '', _style: s };
}

// A tag that shows as plain #hashtag text, lights up with its color when clicked



export function StoryCard({
    story, index, onSelect, onToggleSave, onHide, onOpenInTab,
    isSelected, isHighlighted, isRead,
    topicTextClass, titleColorStyle, activeTopics, onTopicClick
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



    const displayRank = index !== undefined ? index + 1 : null;
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
    const firstActiveMatch = story.topics?.find(t => activeTopics?.some(at => at.toLowerCase() === t.toLowerCase()));
    const activeStyle = firstActiveMatch ? getTagStyle(firstActiveMatch) : null;

    // Unified card styling with hover lifting effect
    const activeBg = isHighlighted
        ? 'bg-gradient-to-r from-emerald-50 via-emerald-50/30 to-white dark:from-emerald-950/30 dark:via-emerald-950/15 dark:to-[#111827] border-l-[3px] border-l-emerald-500 border-y border-r border-y-emerald-200/60 border-r-emerald-100/40 dark:border-y-emerald-500/20 dark:border-r-emerald-500/10 shadow-lg shadow-emerald-500/8 z-10 ring-1 ring-emerald-500/10'
        : isSelected
            ? 'bg-white dark:bg-slate-800/60 border-l-[3px] border-l-emerald-400/50 border-y border-r border-y-emerald-100 border-r-emerald-100 dark:border-y-emerald-500/15 dark:border-r-emerald-500/15 shadow-sm'
            : `bg-white dark:bg-[#111827] border border-slate-100 dark:border-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md hover:scale-[1.003]`;

    return (
        <div
            id={`story-${story.id}`}
            className={`group transition-all duration-200 flex flex-col justify-center relative border rounded-xl px-5 py-3 ${activeBg}`}
            onClick={() => onSelect && onSelect(story.id)}
            onContextMenu={handleContextMenu}
        >
            {/* Action Buttons Container - Top Right - Subtler/Hover Only */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <button
                    onClick={(e) => { e.stopPropagation(); onOpenInTab && onOpenInTab(story.id, 'split'); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all"
                    title="Open in Tab"
                >
                    <Columns size={14} />
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); (window as any).electronAPI ? (window as any).electronAPI.openExternal(story.url) : window.open(story.url, '_blank'); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                    title="Open in Browser"
                >
                    <ExternalLink size={14} />
                </button>

                <button
                    onClick={(e) => { handleCopyLink(e); }}
                    className={`p-1.5 rounded-lg transition-all ${isCopied ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    title={isCopied ? 'Copied!' : 'Copy Link'}
                >
                    {isCopied ? <Check size={14} /> : <Link size={14} />}
                </button>

                <button
                    onClick={(e) => { e.stopPropagation(); if (onToggleSave) onToggleSave(story.id, !saved); }}
                    className={`p-1.5 rounded-lg transition-all ${saved
                        ? 'text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-500/10'
                        : onToggleSave 
                            ? 'text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-200 dark:text-slate-800 cursor-not-allowed'
                        }`}
                    title={!onToggleSave ? 'Login to bookmark' : saved ? 'Unbookmark' : 'Bookmark'}
                >
                    <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                </button>

                {onHide && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(story.id); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                        title="Hide Story"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className={`relative z-10 ${isSelected ? 'pr-6' : 'pr-8'}`}>
                <div className="flex items-start gap-3">
                    {displayRank && (
                        <div className="flex flex-col items-center mt-0.5 shrink-0">
                            <span className="text-[13px] font-black text-slate-300 dark:text-slate-600 tabular-nums w-6 text-center">
                                {displayRank}
                            </span>
                        </div>
                    )}
                    <div className="flex-1">
                        <h3 className="text-[15px] leading-snug mb-1.5 font-bold whitespace-normal transition-all duration-200">
                            <span
                                className={`hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer ${isHighlighted ? 'text-indigo-600 dark:text-indigo-400' : (!titleColorStyle && topicTextClass ? topicTextClass : '')} ${!isHighlighted && !titleColorStyle && !topicTextClass ? (dimmed && !isSelected ? 'text-slate-400 dark:text-slate-500 font-normal' : 'text-slate-800 dark:text-slate-100') : ''}`}
                                style={!isHighlighted && (activeStyle?.color || titleColorStyle) ? { color: (activeStyle?.color || titleColorStyle) as string } : undefined}
                            >
                                {story.title}
                            </span>
                        </h3>

                        {/* Tags Display - Below Title */}
                        {story.topics && story.topics.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                {story.topics.slice(0, 3).map((topic, i) => {
                                    const ts = getTagStyle(topic);
                                    const isActive = activeTopics?.some(t => t.toLowerCase() === topic.toLowerCase());
                                    return (
                                        <span
                                            key={i}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onTopicClick?.(topic);
                                            }}
                                            className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-all duration-200 cursor-pointer ${isActive ? 'ring-1 ring-offset-1 dark:ring-offset-slate-900' : 'opacity-50 hover:opacity-100 hover:scale-105'}`}
                                            style={{
                                                background: ts.bg,
                                                color: ts.color,
                                                borderColor: ts.border,
                                                borderWidth: '1px',
                                                borderStyle: 'solid'
                                            }}
                                        >
                                            #{topic}
                                        </span>
                                    );
                                })}
                                {story.topics.length > 3 && (
                                    <span className="text-[9px] text-slate-400 font-bold">+{story.topics.length - 3}</span>
                                )}
                            </div>
                        )}

                        {/* Compact Metadata Row */}
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                            {domain && (
                                <div className="flex items-center gap-1.5">
                                    <img
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                        alt=""
                                        className="w-3.5 h-3.5 rounded-sm grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <span className="truncate max-w-[120px]">{domain}</span>
                                </div>
                            )}
                            {!domain && story.title.startsWith('Ask HN') && (
                                <div className="flex items-center gap-1 text-indigo-500/70">
                                    <Terminal size={10} />
                                    <span>Ask HN</span>
                                </div>
                            )}
                            <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-500/80">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                {story.score}
                            </span>
                            <button
                                onClick={(e) => { e.stopPropagation(); onSelect && onSelect(story.id); }}
                                className={`flex items-center gap-0.5 transition-colors ${story.descendants > 0 ? 'text-indigo-500 dark:text-indigo-400/80' : 'text-slate-400'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                {story.descendants > 0 ? story.descendants : ''}
                            </button>

                            {/* 1-line AI Summary Preview */}
                            {story.summary && story.summary.trim().length > 0 && (
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 line-clamp-1 italic leading-relaxed">
                                    <Sparkles size={10} className="inline mr-1 text-indigo-400/60" />
                                    {story.summary.replace(/^[-*•]\s+/, '').split('\n')[0].replace(/^[-*•]\s+/, '').slice(0, 120)}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>


            {/* Context Menu Popup */}
            {contextMenuPos && onOpenInTab && (
                <div
                    className="fixed z-[10000] w-[22rem] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1 text-sm text-slate-700 dark:text-slate-300 animate-in fade-in duration-100"
                    style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'split'); setContextMenuPos(null); }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 font-medium text-blue-600 dark:text-blue-400"
                    >
                        📖 Show article and discussion side by side
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'article'); setContextMenuPos(null); }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        📄 Open Story Tab
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenInTab(story.id, 'discussion'); setContextMenuPos(null); }}
                        className="w-full text-left px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        💬 Open Discussion Tab
                    </button>
                </div>
            )}
        </div>
    );
}
