import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, ExternalLink, MessageSquare, ArrowRight } from 'lucide-react';
import type { Story } from '../types';
import ReactMarkdown from 'react-markdown';
import { fetchWithAuth } from '../utils/api';

interface FilterSidebarProps {
    activeTopics: string[];
    setActiveTopics: React.Dispatch<React.SetStateAction<string[]>>;
    disabledTopics: string[];
    setDisabledTopics: React.Dispatch<React.SetStateAction<string[]>>;
    highlightedStory?: Story | null;
    onSummarize?: (id: number) => Promise<any>;
    onOpenInTab?: (id: number, mode?: 'article' | 'discussion' | 'split', keepOpen?: boolean, storyOverride?: Story) => void;
    apiBase?: string;
    user: any;
    topicMatch?: 'any' | 'all' | 'exclusive';
}

// In-memory cache for hover-dwell article excerpts (keyed by story ID)
const excerptCache = new Map<number, string[] | null>();

function extractCleanParagraphs(raw: string, contentType: string, title?: string): string[] {
    if (!raw || !raw.trim()) return [];
    const titleLower = (title || '').trim().toLowerCase();
    const boilerplatePattern = /^(accept all|cookie|we use cookies|privacy policy|sign in|log in|subscribe|share this|follow us|copyright ©)/i;
    const paragraphs: string[] = [];
    let totalChars = 0;

    const pushCandidate = (text: string) => {
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 45) return;
        if (cleaned.toLowerCase() === titleLower) return;
        if (boilerplatePattern.test(cleaned)) return;
        if (paragraphs.length >= 4 || totalChars >= 950) return;
        const remaining = 1050 - totalChars;
        const clipped = cleaned.length > remaining + 40
            ? cleaned.slice(0, remaining).replace(/\s+\S*$/, '') + '…'
            : cleaned;
        paragraphs.push(clipped);
        totalChars += clipped.length;
    };

    if (contentType === 'markdown') {
        const stripped = raw
            .replace(/```[\s\S]*?```/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '')
            .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/^#{1,6}\s+.*$/gm, '')
            .replace(/[*_`~]/g, '');

        for (const block of stripped.split(/\n\s*\n/)) {
            if (paragraphs.length >= 4 || totalChars >= 950) break;
            if (/^\s*[-|+:=]{3,}\s*$/.test(block)) continue;
            pushCandidate(block);
        }
        return paragraphs;
    }

    if (typeof window !== 'undefined') {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        doc.querySelectorAll('script, style, nav, header, footer, aside, svg, figure, table, form, button, noscript, iframe').forEach(el => el.remove());

        const pNodes = Array.from(doc.querySelectorAll('p'));
        for (const p of pNodes) {
            if (paragraphs.length >= 4 || totalChars >= 950) break;
            pushCandidate(p.textContent || '');
        }

        if (paragraphs.length === 0 && doc.body?.textContent) {
            for (const block of doc.body.textContent.split(/\n+/)) {
                if (paragraphs.length >= 4 || totalChars >= 950) break;
                pushCandidate(block);
            }
        }
    }

    return paragraphs;
}

function formatTimeAgo(ts?: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (s >= 86400) return Math.floor(s / 86400) + 'd';
    if (s >= 3600) return Math.floor(s / 3600) + 'h';
    if (s >= 60) return Math.floor(s / 60) + 'm';
    return s + 's';
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
    activeTopics,
    setActiveTopics,
    disabledTopics,
    setDisabledTopics,
    highlightedStory,
    onSummarize,
    onOpenInTab,
    apiBase,
    user,
    topicMatch = 'any',
}) => {
    const [summarizing, setSummarizing] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Dwell-loaded article excerpt state
    const [excerptParagraphs, setExcerptParagraphs] = useState<string[] | null>(null);
    const [excerptLoading, setExcerptLoading] = useState(false);

    useEffect(() => {
        setErrorMsg(null);
    }, [highlightedStory?.id]);

    // Auto-fetch clean opening paragraphs after a 550ms dwell on a story
    useEffect(() => {
        const storyId = highlightedStory?.id;
        const storyUrl = highlightedStory?.url;
        const storyTitle = highlightedStory?.title;

        if (!storyId || !storyUrl || !apiBase) {
            setExcerptParagraphs(null);
            setExcerptLoading(false);
            return;
        }

        if (excerptCache.has(storyId)) {
            setExcerptParagraphs(excerptCache.get(storyId) ?? null);
            setExcerptLoading(false);
            return;
        }

        setExcerptParagraphs(null);
        setExcerptLoading(false);

        const controller = new AbortController();
        const dwellTimer = window.setTimeout(() => {
            setExcerptLoading(true);
            fetchWithAuth(`${apiBase}/api/stories/${storyId}/content`, { signal: controller.signal })
                .then(res => (res.ok ? res.json() : null))
                .then(data => {
                    if (controller.signal.aborted) return;
                    const paras = data?.content
                        ? extractCleanParagraphs(data.content, data.content_type || 'html', storyTitle)
                        : [];
                    const result = paras.length > 0 ? paras : null;
                    excerptCache.set(storyId, result);
                    setExcerptParagraphs(result);
                })
                .catch(err => {
                    if (err?.name !== 'AbortError') {
                        excerptCache.set(storyId, null);
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) {
                        setExcerptLoading(false);
                    }
                });
        }, 550);

        return () => {
            window.clearTimeout(dwellTimer);
            controller.abort();
        };
    }, [highlightedStory?.id, highlightedStory?.url, highlightedStory?.title, apiBase]);

    const handleCopy = async () => {
        if (!highlightedStory?.summary) return;
        try {
            await navigator.clipboard.writeText(highlightedStory.summary);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    const handleRegen = async () => {
        if (!highlightedStory?.id || summarizing) return;
        setSummarizing(true);
        setErrorMsg(null);
        try {
            const res = await onSummarize?.(highlightedStory.id);
            if (res && res.error) {
                setErrorMsg(res.error);
            }
        } catch (e: any) {
            setErrorMsg(e?.message || 'Summarization failed');
        } finally {
            setSummarizing(false);
        }
    };

    const domain = (() => {
        try {
            if (highlightedStory?.url) {
                return new URL(highlightedStory.url).hostname.replace(/^www\./, '');
            }
        } catch { }
        return '';
    })();

    const summary = highlightedStory?.summary ?? null;
    const hasSummary = Boolean(summary && summary.trim().length > 0);
    const aiEnabled = user?.ai_summaries_enabled;

    const summaryLines = hasSummary
        ? summary!
              .split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0)
              .map(line => {
                  const match = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
                  return match ? match[1].trim() : line;
              })
        : [];

    if (!highlightedStory) {
        return (
            <aside className="flex-1 shrink-0 h-full border-l border-stone-200/80 dark:border-white/[0.07] bg-[#f5f5f2] dark:bg-[#161619] hidden md:flex items-center justify-center p-8 text-center">
                <p className="text-[13px] text-stone-400 dark:text-zinc-500">
                    Hover or select a story to preview
                </p>
            </aside>
        );
    }

    const externalUrl = highlightedStory.url || `https://news.ycombinator.com/item?id=${highlightedStory.id}`;

    return (
        <aside className="flex-1 shrink-0 h-full border-l border-stone-200/80 dark:border-white/[0.07] bg-[#f5f5f2] dark:bg-[#161619] hidden md:flex flex-col overflow-hidden">
            {/* Editorial Story Header */}
            <div className="px-6 pt-5 pb-4 border-b border-stone-200/80 dark:border-white/[0.07] shrink-0">
                {/* Top Metadata + Quiet Icon Actions */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 text-[11.5px] text-stone-400 dark:text-zinc-500 min-w-0 truncate">
                        {domain && (
                            <span className="text-stone-500 dark:text-zinc-400 truncate">{domain}</span>
                        )}
                        {domain && <span className="opacity-40">·</span>}
                        {highlightedStory.time && <span>{formatTimeAgo(highlightedStory.time)}</span>}
                        {highlightedStory.score != null && (
                            <>
                                <span className="opacity-40">·</span>
                                <span className="tabular-nums">{highlightedStory.score} pts</span>
                            </>
                        )}
                        {highlightedStory.by && (
                            <>
                                <span className="opacity-40">·</span>
                                <span className="truncate">{highlightedStory.by}</span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                        {hasSummary && (
                            <>
                                <button
                                    onClick={handleCopy}
                                    title="Copy summary"
                                    className="p-1.5 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
                                >
                                    {copied ? <Check size={13} className="text-stone-700 dark:text-zinc-200" /> : <Copy size={13} />}
                                </button>
                                <button
                                    onClick={handleRegen}
                                    disabled={summarizing}
                                    title="Regenerate summary"
                                    className="p-1.5 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer disabled:opacity-40"
                                >
                                    <RefreshCw size={13} className={summarizing ? 'animate-spin' : ''} />
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => {
                                (window as any).electronAPI
                                    ? (window as any).electronAPI.openExternal(externalUrl)
                                    : window.open(externalUrl, '_blank');
                            }}
                            title="Open in default browser"
                            className="p-1.5 rounded-md text-stone-400 dark:text-zinc-500 hover:text-stone-800 dark:hover:text-zinc-200 hover:bg-stone-200/70 dark:hover:bg-white/[0.07] transition-colors cursor-pointer"
                        >
                            <ExternalLink size={13} />
                        </button>
                    </div>
                </div>

                {/* Story Headline */}
                <h2
                    onClick={() => onOpenInTab?.(highlightedStory.id, highlightedStory.url ? 'article' : 'discussion', false, highlightedStory)}
                    className="text-[18px] font-semibold leading-[1.32] tracking-[-0.02em] text-stone-900 dark:text-[#f2f2f5] hover:text-[#e06834] dark:hover:text-[#eb7c49] transition-colors cursor-pointer"
                >
                    {highlightedStory.title}
                </h2>

                {/* Clean Primary Actions */}
                {onOpenInTab && (
                    <div className="flex items-center gap-2 mt-3.5">
                        <button
                            onClick={() => onOpenInTab(highlightedStory.id, highlightedStory.url ? 'article' : 'discussion', false, highlightedStory)}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-stone-900 text-white hover:bg-stone-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white transition-colors cursor-pointer"
                        >
                            {highlightedStory.url ? 'Read Article' : 'Open Story'}
                        </button>
                        <button
                            onClick={() => onOpenInTab(highlightedStory.id, 'discussion', false, highlightedStory)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-stone-200/70 text-stone-700 hover:bg-stone-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1] transition-colors cursor-pointer"
                        >
                            <MessageSquare size={12} />
                            <span>Discussion{highlightedStory.descendants ? ` (${highlightedStory.descendants})` : ''}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Scrollable Editorial Body: Takeaways + Dwell Article Excerpt + Quiet Topics */}
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 custom-scrollbar space-y-6">
                {/* 1. Key Takeaways (Unboxed Editorial Serif) */}
                {(aiEnabled || hasSummary) && (
                    <section>
                        <h3 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500 mb-3 select-none">
                            Key takeaways
                        </h3>

                        {hasSummary ? (
                            <ul className="space-y-3 m-0 p-0 list-none select-text">
                                {summaryLines.map((content, idx) => (
                                    <li key={idx} className="flex items-start gap-3">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#e06834]/75 mt-[10px] shrink-0" />
                                        <div className="flex-1 font-editorial text-[14.5px] leading-[1.7] text-stone-700 dark:text-[#d6d6dc] min-w-0">
                                            <ReactMarkdown
                                                components={{
                                                    p: ({ node, ...props }) => <span className="block m-0 p-0" {...props} />,
                                                    strong: ({ node, ...props }) => (
                                                        <strong className="font-semibold text-stone-900 dark:text-zinc-100" {...props} />
                                                    ),
                                                }}
                                            >
                                                {content}
                                            </ReactMarkdown>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="py-2 space-y-3">
                                <p className="text-[13px] text-stone-500 dark:text-zinc-400 leading-relaxed">
                                    No summary generated yet for this story.
                                </p>
                                <button
                                    onClick={handleRegen}
                                    disabled={summarizing}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-stone-200/80 dark:bg-white/[0.08] text-stone-800 dark:text-zinc-200 hover:bg-stone-300/70 dark:hover:bg-white/[0.13] transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={summarizing ? 'animate-spin' : ''} />
                                    <span>{summarizing ? 'Summarizing…' : 'Generate summary'}</span>
                                </button>
                                {errorMsg && (
                                    <p className="text-[12px] text-red-600 dark:text-red-400 leading-snug break-words select-text">
                                        {errorMsg}
                                    </p>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* 2. Dwell-Loaded Article Excerpt */}
                {highlightedStory.url && (excerptLoading || (excerptParagraphs && excerptParagraphs.length > 0)) && (
                    <section className="pt-5 border-t border-stone-200/80 dark:border-white/[0.07]">
                        <div className="flex items-center justify-between mb-3 select-none">
                            <h3 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500">
                                From the article
                            </h3>
                            {excerptLoading && (
                                <span className="text-[11px] text-stone-400 dark:text-zinc-500">Loading preview…</span>
                            )}
                        </div>

                        {excerptParagraphs && excerptParagraphs.length > 0 && (
                            <div className="space-y-3 select-text">
                                <div className="relative space-y-3 font-editorial text-[14px] leading-[1.72] text-stone-600 dark:text-zinc-400">
                                    {excerptParagraphs.map((para, idx) => (
                                        <p key={idx} className="m-0">
                                            {para}
                                        </p>
                                    ))}
                                </div>

                                {onOpenInTab && (
                                    <button
                                        onClick={() => onOpenInTab(highlightedStory.id, 'article', false, highlightedStory)}
                                        className="inline-flex items-center gap-1 pt-1 text-[12px] font-medium text-stone-600 dark:text-zinc-300 hover:text-[#e06834] dark:hover:text-[#eb7c49] transition-colors cursor-pointer"
                                    >
                                        <span>Continue reading</span>
                                        <ArrowRight size={12} />
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* 3. Quiet Monochrome Topic Chips */}
                {highlightedStory.topics && highlightedStory.topics.length > 0 && (
                    <section className="pt-5 border-t border-stone-200/80 dark:border-white/[0.07]">
                        <h4 className="text-[11.5px] font-medium text-stone-400 dark:text-zinc-500 mb-2.5 select-none">
                            Topics
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                            {highlightedStory.topics.map(topic => {
                                const isPresent = activeTopics.includes(topic);
                                const isEnabled = isPresent && !disabledTopics.includes(topic);
                                return (
                                    <button
                                        key={`article-topic-${topic}`}
                                        onClick={() => {
                                            if (!isPresent) {
                                                setActiveTopics(prev => [...new Set([...prev, topic])]);
                                                if (topicMatch === 'exclusive') {
                                                    setDisabledTopics([...activeTopics]);
                                                } else {
                                                    setDisabledTopics(prev => prev.filter(x => x !== topic));
                                                }
                                            } else if (isEnabled) {
                                                setDisabledTopics(prev => [...new Set([...prev, topic])]);
                                            } else if (topicMatch === 'exclusive') {
                                                setDisabledTopics(activeTopics.filter(x => x !== topic));
                                            } else {
                                                setDisabledTopics(prev => prev.filter(x => x !== topic));
                                            }
                                        }}
                                        className={`px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer ${
                                            isEnabled
                                                ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                                : 'bg-stone-200/65 text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:bg-white/[0.06] dark:text-zinc-400 dark:hover:bg-white/[0.1] dark:hover:text-zinc-200'
                                        }`}
                                    >
                                        {topic}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}
            </div>
        </aside>
    );
};
