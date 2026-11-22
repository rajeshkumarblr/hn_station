import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, BookOpen, ExternalLink,
    MessageSquare, Play, Pause, RefreshCw, X
} from 'lucide-react';
import type { Story } from '../types';
import { fetchWithAuth } from '../utils/api';

export type BriefingStage = 'postgres' | 'ai';

function getDomain(url?: string): string {
    if (!url) return 'news.ycombinator.com';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return 'news.ycombinator.com';
    }
}

function formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return 'recently';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'recently';
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
}

interface BriefingDeckProps {
    apiBase: string;
    isOpen: boolean;
    initialStage?: BriefingStage;
    onClose: () => void;
    onGoDeep: (storyId: number, stage: BriefingStage, slideIndex: number) => void;
    onSummarizeStory: (storyId: number) => Promise<void>;
}

const SLIDE_DURATION_MS = 12000;

export const BriefingDeck: React.FC<BriefingDeckProps> = ({
    apiBase,
    isOpen,
    initialStage = 'postgres',
    onClose,
    onGoDeep,
    onSummarizeStory,
}) => {
    const [stage, setStage] = useState<BriefingStage>(initialStage);
    const [pgStories, setPgStories] = useState<Story[]>([]);
    const [aiStories, setAiStories] = useState<Story[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [currentIndex, setCurrentIndex] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [progress, setProgress] = useState<number>(0);
    const [summarizingIds, setSummarizingIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            setStage(initialStage);
            setCurrentIndex(0);
            setProgress(0);
        } else {
            setIsPlaying(false);
        }
    }, [isOpen, initialStage]);

    const fetchBriefingStories = useCallback(async (silent = false) => {
        if (!apiBase) return;
        if (!silent) setLoading(true);
        try {
            const [pgRes, aiRes] = await Promise.all([
                fetchWithAuth(`${apiBase}/api/stories?limit=5&sort=latest&topic=Postgres`, { credentials: 'include' }),
                fetchWithAuth(`${apiBase}/api/stories?limit=5&sort=latest&topic=LLM&topic=AI&topic_match=any`, { credentials: 'include' }),
            ]);

            if (pgRes.ok) {
                const pgData = await pgRes.json();
                setPgStories(pgData.stories || []);
            }
            if (aiRes.ok) {
                const aiData = await aiRes.json();
                setAiStories(aiData.stories || []);
            }
        } catch (err) {
            console.error('Failed to load slideshow stories:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (!isOpen) return;
        fetchBriefingStories(false);
        const pollTimer = setInterval(() => {
            fetchBriefingStories(true);
        }, 8000);
        return () => clearInterval(pollTimer);
    }, [isOpen, fetchBriefingStories]);

    const activeStories = stage === 'postgres' ? pgStories : aiStories;
    const currentStory = activeStories[currentIndex] || null;

    // Prioritize summaries for stories shown in the slideshow
    useEffect(() => {
        if (!isOpen || !apiBase) return;
        const unsummarizedIds = [...pgStories, ...aiStories]
            .filter(s => !s.summary || !s.summary.trim())
            .map(s => s.id);
        if (unsummarizedIds.length > 0) {
            fetchWithAuth(`${apiBase}/api/summary/prioritize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ story_ids: unsummarizedIds }),
            }).catch(() => {});
        }
    }, [isOpen, apiBase, pgStories, aiStories]);

    // Auto-advance timer when Auto-Play is active
    useEffect(() => {
        if (!isOpen || !isPlaying || activeStories.length === 0) {
            setProgress(0);
            return;
        }
        const stepMs = 100;
        const timer = setInterval(() => {
            setProgress(prev => {
                const next = prev + (stepMs / SLIDE_DURATION_MS) * 100;
                if (next >= 100) {
                    if (currentIndex < activeStories.length - 1) {
                        setCurrentIndex(i => i + 1);
                    } else if (stage === 'postgres' && aiStories.length > 0) {
                        setStage('ai');
                        setCurrentIndex(0);
                    } else {
                        setIsPlaying(false);
                    }
                    return 0;
                }
                return next;
            });
        }, stepMs);
        return () => clearInterval(timer);
    }, [isOpen, isPlaying, currentIndex, activeStories.length, stage, aiStories.length]);

    const handleStageSwitch = (nextStage: BriefingStage) => {
        setStage(nextStage);
        setCurrentIndex(0);
        setProgress(0);
    };

    const handlePrev = useCallback(() => {
        setProgress(0);
        if (currentIndex > 0) {
            setCurrentIndex(i => i - 1);
        } else if (stage === 'ai' && pgStories.length > 0) {
            setStage('postgres');
            setCurrentIndex(Math.max(0, pgStories.length - 1));
        }
    }, [currentIndex, stage, pgStories.length]);

    const handleNext = useCallback(() => {
        setProgress(0);
        if (currentIndex < activeStories.length - 1) {
            setCurrentIndex(i => i + 1);
        } else if (stage === 'postgres' && aiStories.length > 0) {
            setStage('ai');
            setCurrentIndex(0);
        } else {
            onClose();
        }
    }, [currentIndex, activeStories.length, stage, aiStories.length, onClose]);

    // Keyboard shortcuts: Esc to close, Left/Right/Space to flip slides, Enter to read
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                handleNext();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'Enter' && currentStory) {
                e.preventDefault();
                onGoDeep(currentStory.id, stage, currentIndex);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose, handleNext, handlePrev, currentStory, onGoDeep, stage, currentIndex]);

    const triggerSummary = async (storyId: number) => {
        setSummarizingIds(prev => new Set(prev).add(storyId));
        try {
            await onSummarizeStory(storyId);
            await fetchBriefingStories(true);
        } finally {
            setSummarizingIds(prev => {
                const next = new Set(prev);
                next.delete(storyId);
                return next;
            });
        }
    };

    if (!isOpen) return null;

    const summaryBullets = currentStory?.summary
        ? currentStory.summary
              .split('\n')
              .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
              .filter(Boolean)
        : [];

    const isLastPgSlide = stage === 'postgres' && currentIndex >= Math.max(0, activeStories.length - 1);
    const isLastAiSlide = stage === 'ai' && currentIndex >= Math.max(0, activeStories.length - 1);

    return (
        <div
            className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 select-none"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Left Floating Arrow */}
            <button
                onClick={handlePrev}
                disabled={stage === 'postgres' && currentIndex === 0}
                title="Previous Slide (←)"
                className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-white/10 shadow-lg mr-4 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer shrink-0"
            >
                <ChevronLeft size={20} />
            </button>

            {/* Centered Slideshow Card */}
            <div className="w-full max-w-3xl max-h-[85vh] bg-[#fafaf8] dark:bg-[#161619] border border-stone-200 dark:border-white/[0.08] rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Slim Progress Bar */}
                <div className="h-[2px] w-full bg-stone-200 dark:bg-white/[0.06] shrink-0">
                    <div
                        className="h-full bg-[#e06834] transition-all duration-150"
                        style={{
                            width: isPlaying
                                ? `${progress}%`
                                : `${activeStories.length > 0 ? ((currentIndex + 1) / activeStories.length) * 100 : 100}%`,
                        }}
                    />
                </div>

                {/* Single Clean Header Bar */}
                <div className="px-5 py-3 border-b border-stone-200/80 dark:border-white/[0.07] flex items-center justify-between gap-3 shrink-0">
                    {/* Topic Switcher */}
                    <div className="flex items-center gap-0.5 bg-stone-200/60 dark:bg-white/[0.05] p-0.5 rounded-md">
                        <button
                            onClick={() => handleStageSwitch('postgres')}
                            className={`px-3 py-1 rounded-[5px] text-[12px] font-medium transition-colors cursor-pointer ${
                                stage === 'postgres'
                                    ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                            }`}
                        >
                            Postgres
                        </button>
                        <button
                            onClick={() => handleStageSwitch('ai')}
                            className={`px-3 py-1 rounded-[5px] text-[12px] font-medium transition-colors cursor-pointer ${
                                stage === 'ai'
                                    ? 'bg-white dark:bg-zinc-800 text-stone-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                            }`}
                        >
                            LLM &amp; AI
                        </button>
                    </div>

                    {/* Right Controls: Auto-Play + Close Button */}
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setIsPlaying(p => !p)}
                            title={isPlaying ? 'Pause auto-advance' : 'Auto-advance slides'}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
                                isPlaying
                                    ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                    : 'bg-stone-200/60 dark:bg-white/[0.06] text-stone-600 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white'
                            }`}
                        >
                            {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                            <span>{isPlaying ? 'Pause' : 'Auto'}</span>
                        </button>

                        <button
                            onClick={onClose}
                            title="Close Slideshow (Esc)"
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-stone-200/60 dark:bg-white/[0.06] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-600 dark:text-zinc-300 hover:text-stone-900 dark:hover:text-white text-[12px] font-medium transition-colors cursor-pointer"
                        >
                            <X size={13} />
                            <span>Close</span>
                        </button>
                    </div>
                </div>

                {/* Scrollable Slide Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-7 py-7 sm:px-9">
                    {loading && activeStories.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-stone-400 dark:text-zinc-500">
                            <RefreshCw size={20} className="animate-spin" />
                            <span className="text-[13px]">Loading slides…</span>
                        </div>
                    ) : !currentStory ? (
                        <div className="py-16 text-center text-stone-400 dark:text-zinc-500 text-[13px]">
                            No {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} stories available yet.
                        </div>
                    ) : (
                        <>
                            {/* Minimal Metadata Line */}
                            <div className="flex flex-wrap items-center gap-2 text-[12px] text-stone-400 dark:text-zinc-500 mb-3">
                                <span className="font-medium text-stone-700 dark:text-zinc-300 tabular-nums">
                                    {currentIndex + 1} / {activeStories.length}
                                </span>
                                <span>·</span>
                                {currentStory.url && (
                                    <>
                                        <span className="text-stone-600 dark:text-zinc-400">
                                            {getDomain(currentStory.url)}
                                        </span>
                                        <span>·</span>
                                    </>
                                )}
                                <span className="tabular-nums">▲ {currentStory.score}</span>
                                <span>·</span>
                                <span>{formatRelativeTime((currentStory as any).posted_at || currentStory.time || currentStory.created_at)}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                    <MessageSquare size={11} /> {currentStory.descendants || 0}
                                </span>
                            </div>

                            {/* Headline */}
                            <h2
                                onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                className="text-xl sm:text-[23px] font-semibold tracking-[-0.02em] text-stone-900 dark:text-[#f2f2f5] leading-[1.3] hover:text-[#e06834] dark:hover:text-[#eb7c49] transition-colors cursor-pointer mb-6"
                            >
                                {currentStory.title}
                            </h2>

                            {/* Editorial Takeaways */}
                            <div className="pt-5 border-t border-stone-200/80 dark:border-white/[0.07]">
                                {summaryBullets.length > 0 ? (
                                    <ul className="space-y-3.5 m-0 p-0 list-none select-text">
                                        {summaryBullets.map((bullet, idx) => (
                                            <li key={idx} className="flex items-start gap-3 font-editorial text-[15px] text-stone-700 dark:text-[#d6d6dc] leading-[1.72]">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#e06834]/75 mt-[11px] shrink-0" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="flex items-center justify-between gap-4 py-2">
                                        <span className="text-[13px] text-stone-500 dark:text-zinc-400">
                                            {summarizingIds.has(currentStory.id)
                                                ? 'Generating summary…'
                                                : 'No summary generated yet for this story.'}
                                        </span>
                                        <button
                                            onClick={() => triggerSummary(currentStory.id)}
                                            disabled={summarizingIds.has(currentStory.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-stone-200/70 dark:bg-white/[0.08] text-stone-800 dark:text-zinc-200 text-[12px] font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                        >
                                            <RefreshCw size={11} className={summarizingIds.has(currentStory.id) ? 'animate-spin' : ''} />
                                            <span>{summarizingIds.has(currentStory.id) ? 'Summarizing…' : 'Summarize'}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Clean Single-Row Footer */}
                {currentStory && (
                    <div className="px-6 py-3.5 border-t border-stone-200/80 dark:border-white/[0.07] bg-[#f5f5f2] dark:bg-[#131316] flex items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[12px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
                            >
                                <BookOpen size={13} />
                                <span>Read Article</span>
                            </button>

                            {currentStory.url && (
                                <a
                                    href={currentStory.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-200/70 dark:bg-white/[0.06] hover:bg-stone-200 dark:hover:bg-white/[0.1] text-stone-700 dark:text-zinc-300 text-[12px] font-medium transition-colors"
                                >
                                    <ExternalLink size={12} />
                                    <span className="hidden sm:inline">Browser</span>
                                </a>
                            )}
                        </div>

                        {/* Slide Dots */}
                        <div className="flex items-center gap-1.5">
                            {activeStories.map((s, idx) => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setCurrentIndex(idx);
                                        setProgress(0);
                                    }}
                                    title={s.title}
                                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                        idx === currentIndex
                                            ? 'w-5 bg-[#e06834]'
                                            : 'w-1.5 bg-stone-300 dark:bg-zinc-700 hover:bg-stone-400'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Prev / Next */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handlePrev}
                                disabled={stage === 'postgres' && currentIndex === 0}
                                className="p-1.5 rounded-lg bg-stone-200/70 dark:bg-white/[0.06] text-stone-700 dark:text-zinc-300 disabled:opacity-35 transition-colors cursor-pointer md:hidden"
                                title="Previous (←)"
                            >
                                <ChevronLeft size={14} />
                            </button>

                            {isLastPgSlide ? (
                                <button
                                    onClick={() => handleStageSwitch('ai')}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-950 text-[12px] font-medium transition-opacity hover:opacity-90 cursor-pointer"
                                >
                                    <span>LLM &amp; AI</span>
                                    <ChevronRight size={13} />
                                </button>
                            ) : isLastAiSlide ? (
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-200/80 dark:bg-white/[0.08] text-stone-800 dark:text-zinc-200 text-[12px] font-medium transition-colors cursor-pointer"
                                >
                                    <span>Done</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleNext}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-200/80 dark:bg-white/[0.08] hover:bg-stone-200 dark:hover:bg-white/[0.12] text-stone-800 dark:text-zinc-100 text-[12px] font-medium transition-colors cursor-pointer"
                                >
                                    <span>Next</span>
                                    <ChevronRight size={13} />
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Floating Arrow */}
            <button
                onClick={handleNext}
                title="Next Slide (→)"
                className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-200 border border-white/10 shadow-lg ml-4 transition-colors cursor-pointer shrink-0"
            >
                <ChevronRight size={20} />
            </button>
        </div>
    );
};
