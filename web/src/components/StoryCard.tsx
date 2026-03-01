import { useState } from 'react';
import { Star, Terminal, Link, Check } from 'lucide-react';

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
    onQueueToggle?: (id: number) => void;
    isSelected?: boolean;
    isHighlighted?: boolean;
    isRead?: boolean;
    isQueued?: boolean;
    isEven?: boolean;
    topicTextClass?: string | null;
    titleColorStyle?: string | null; // inline CSS color for the title
}

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s";
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

function truncateSummary(text: string): string {
    if (!text) return "";
    // Split on line breaks (bullet points) first, then on sentence endings
    const lines = text.split(/\n+/).map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    if (lines.length >= 2) {
        return lines.slice(0, 2).join(' ') + (lines.length > 2 ? '...' : '');
    }
    // Fall back to sentence splitting
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length <= 2) return text.trim();
    return sentences.slice(0, 2).join(' ').trim() + '...';
}


export function StoryCard({ story, index, onSelect, onToggleSave, onHide, onQueueToggle, isSelected, isHighlighted, isRead, isQueued, isEven, topicTextClass, titleColorStyle }: StoryCardProps) {
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

    const date = new Date(story.time);
    const timeAgo = getTimeAgo(date);

    const displayRank = index !== undefined ? index + 1 : null;
    const dimmed = story.is_read || isRead;
    const saved = story.is_saved || false;

    // Zebra coloring — even rows: white, odd rows: light-blue tint
    let bgClass = isEven
        ? 'bg-white dark:bg-slate-900/90'
        : 'bg-blue-50/60 dark:bg-blue-900/15';

    if (dimmed && !isSelected) {
        bgClass = isEven
            ? 'bg-slate-50/90 dark:bg-slate-900/70'
            : 'bg-blue-50/30 dark:bg-blue-900/10';
    }

    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };

    const truncatedSummary = truncateSummary(story.summary || "");

    // Active state overrides everything. Removed z-10 so the fixed child popup isn't trapped in a local stacking context.
    const activeBg = isSelected
        ? 'bg-white dark:bg-[#1e293b] border-l-4 border-l-blue-600 dark:border-l-blue-500 shadow-md shadow-slate-200/50 dark:shadow-black/40 ring-1 ring-slate-200 dark:ring-white/10'
        : isHighlighted
            ? 'bg-slate-50 dark:bg-slate-800/60 border-l-4 border-l-blue-400 dark:border-l-blue-400 shadow-sm ring-1 ring-blue-200 dark:ring-blue-500/30 font-semibold'
            : `${bgClass} hover:ring-1 hover:ring-slate-300 dark:hover:ring-slate-700 hover:shadow-sm border-l-4 border-l-transparent`;


    return (
        <div
            className={`group relative rounded-md py-1.5 px-3 transition-all duration-150 ${activeBg}`}
            onMouseMove={handleMouseMove}
        >
            {/* Action Buttons Container - Top Right */}
            <div className="absolute top-2 right-2 flex items-center gap-1 z-20">
                {/* Queue button */}
                {onQueueToggle && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onQueueToggle(story.id); }}
                        className={`p-1 rounded-md transition-all duration-150 ${isQueued
                            ? 'text-blue-500 dark:text-blue-400 hover:text-blue-600 hover:scale-110 bg-blue-50 dark:bg-blue-900/30'
                            : 'text-gray-400 dark:text-slate-600 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:scale-110'
                            }`}
                        title={isQueued ? 'Remove from Queue' : 'Add to Queue'}
                    >
                        {isQueued ? <Check size={14} /> : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
                    </button>
                )}

                {/* Save/Star button */}
                {onToggleSave && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleSave(story.id, !saved); }}
                        className={`p-1 rounded-md transition-all duration-150 ${saved
                            ? 'text-yellow-500 dark:text-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-300 hover:scale-110'
                            : 'text-gray-400 dark:text-slate-600 hover:text-yellow-500 dark:hover:text-yellow-400 hover:scale-110'
                            }`}
                        title={saved ? 'Unsave' : 'Save'}
                    >
                        <Star size={14} fill={saved ? "currentColor" : "none"} />
                    </button>
                )}

                {/* Close button */}
                {onHide && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onHide(story.id); }}
                        className="p-1 rounded-md text-gray-400 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-all duration-150"
                        title="Hide Story"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                )}
            </div>

            <div className={`relative z-10 ${isSelected ? 'pr-6' : 'pr-8'}`}>
                <h3 className="text-[14px] leading-snug mb-1 font-semibold whitespace-normal transition-all duration-200">
                    {displayRank && (
                        <span className="text-slate-400 dark:text-slate-500 font-normal mr-2 select-none tabular-nums text-xs">
                            {displayRank}.
                        </span>
                    )}
                    {/* Title + Topic Chip + Tooltip Wrapper */}
                    <span
                        className="relative inline-block align-middle group/tooltip"
                    >
                        {/* Title */}
                        <span
                            className={`hover:opacity-80 transition-opacity cursor-pointer font-bold mr-1.5 ${!titleColorStyle && topicTextClass ? topicTextClass : ''} ${!titleColorStyle && !topicTextClass ? (dimmed && !isSelected ? 'text-slate-500/80 dark:text-slate-500 font-normal' : 'text-slate-800 dark:text-slate-200') : ''}`}
                            style={titleColorStyle ? { color: titleColorStyle } : undefined}
                        >
                            {story.title}
                        </span>
                    </span>

                    {/* Copy Link button */}
                    <button
                        onClick={handleCopyLink}
                        className={`inline-flex ml-0.5 align-middle transition-all duration-150 ${isCopied ? 'text-green-500 scale-110' : 'text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 hover:scale-110'}`}
                        title={isCopied ? 'Copied!' : 'Copy Link'}
                    >
                        {isCopied ? <Check size={12} /> : <Link size={12} />}
                    </button>
                </h3>

                {/* Details Row - Visible on selection OR hover */}
                {/* We use grid/height transition for smooth expansion effect on hover, or just simple block display for now */}
                <div className="overflow-hidden transition-all duration-200 ease-in-out mt-1 opacity-100 max-h-20">
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium pt-0.5">
                        {domain && (
                            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-500">
                                <img
                                    src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
                                    alt=""
                                    className="w-3 h-3 rounded-sm opacity-75"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                                <span className="truncate max-w-[150px] hover:text-slate-800 dark:hover:text-slate-300 transition-colors">{domain}</span>
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                            </div>
                        )}
                        {!domain && story.title.startsWith('Ask HN') && (
                            <div className="flex items-center gap-1 text-slate-500">
                                <Terminal size={11} />
                                <span>Ask HN</span>
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                            </div>
                        )}

                        <span className="flex items-center gap-1 text-orange-600 dark:text-orange-500">
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                            {story.score}
                        </span>

                        <span className="flex items-center gap-1">
                            {story.by}
                        </span>

                        <span className="flex items-center gap-1" title={date.toLocaleString()}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            {timeAgo}
                        </span>

                        <button
                            onClick={(e) => { e.stopPropagation(); onSelect && onSelect(story.id); }}
                            className={`flex items-center gap-1 transition-colors px-2 py-0.5 rounded-full ${story.descendants > 0 ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            {story.descendants > 0 ? `${story.descendants}` : 'discuss'}
                        </button>

                        {/* Tags Display */}
                        {story.topics && story.topics.length > 0 && (
                            <div className="flex items-center gap-1.5 ml-1 pt-0.5">
                                <span className="text-slate-300 dark:text-slate-600">•</span>
                                {story.topics.slice(0, 3).map((topic, i) => {
                                    const ts = getTagStyle(topic);
                                    return (
                                        <span
                                            key={i}
                                            className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold border"
                                            style={{ color: ts.color, background: ts.bg, borderColor: ts.border }}
                                        >
                                            {topic}
                                        </span>
                                    );
                                })}
                                {story.topics.length > 3 && (
                                    <span className="text-[9px] text-slate-400">+{story.topics.length - 3}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Hover Summary Popup */}
            {story.summary && (
                <div
                    className="hidden group-hover:block fixed z-[9999] w-80 pointer-events-none animate-in fade-in slide-in-from-left-2 duration-200"
                    style={{
                        left: `${mousePos.x + 20}px`,
                        top: `${mousePos.y + 10}px`
                    }}
                >
                    <div className="bg-[#f0f6ff] dark:bg-[#0f2140] border border-blue-200 dark:border-blue-700 rounded-xl p-4 shadow-2xl shadow-blue-900/50 opacity-100" style={{ isolation: 'isolate' }}>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                            <span className="text-[10px] uppercase tracking-widest font-bold text-blue-600 dark:text-blue-400">Summary</span>
                        </div>
                        <p className="text-[13px] leading-relaxed text-slate-800 dark:text-slate-100 font-medium">
                            {truncatedSummary}
                        </p>
                    </div>
                </div>
            )}
        </div >
    );
}

