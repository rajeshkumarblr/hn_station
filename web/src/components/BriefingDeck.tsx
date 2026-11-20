import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, BookOpen, ExternalLink,
    MessageSquare, Sparkles, Play, Pause, Database, Cpu,
    RefreshCw, X
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
            className="fixed inset-0 z-[250] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 select-none"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            {/* Left Floating Arrow */}
            <button
                onClick={handlePrev}
                disabled={stage === 'postgres' && currentIndex === 0}
                title="Previous Slide (←)"
                className="hidden md:flex items-center justify-center w-11 h-11 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-lg mr-4 disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shrink-0"
            >
                <ChevronLeft size={22} />
            </button>

            {/* Centered Slideshow Card */}
            <div className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-[#171f30] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                {/* Slim Progress Bar */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 shrink-0">
                    <div
                        className={`h-full transition-all duration-150 ${
                            stage === 'postgres' ? 'bg-sky-500' : 'bg-indigo-500'
                        }`}
                        style={{
                            width: isPlaying
                                ? `${progress}%`
                                : `${activeStories.length > 0 ? ((currentIndex + 1) / activeStories.length) * 100 : 100}%`,
                        }}
                    />
                </div>

                {/* Single Clean Header Bar */}
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    {/* Topic Switcher */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#111726] p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                        <button
                            onClick={() => handleStageSwitch('postgres')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                                stage === 'postgres'
                                    ? 'bg-sky-600 text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        >
                            <Database size={12} />
                            <span>Postgres</span>
                        </button>
                        <button
                            onClick={() => handleStageSwitch('ai')}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                                stage === 'ai'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            }`}
                        >
                            <Cpu size={12} />
                            <span>LLM & AI</span>
                        </button>
                    </div>

                    {/* Right Controls: Auto-Play + Prominent Close Button */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsPlaying(p => !p)}
                            title={isPlaying ? 'Pause auto-advance' : 'Auto-advance slides'}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                                isPlaying
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-slate-100 dark:bg-[#1e273d] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                            <span>{isPlaying ? 'Pause' : 'Auto'}</span>
                        </button>

                        <button
                            onClick={onClose}
                            title="Close Slideshow (Esc)"
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e273d] hover:bg-red-500/15 hover:text-red-500 hover:border-red-500/30 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                        >
                            <X size={14} />
                            <span>Close</span>
                        </button>
                    </div>
                </div>

                {/* Scrollable Slide Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6 sm:px-8">
                    {loading && activeStories.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <RefreshCw size={24} className="animate-spin text-sky-500" />
                            <span className="text-sm">Loading slides...</span>
                        </div>
                    ) : !currentStory ? (
                        <div className="py-16 text-center text-slate-400 text-sm">
                            No {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} stories available yet.
                        </div>
                    ) : (
                        <>
                            {/* Minimal Metadata Line */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-3">
                                <span className="font-bold text-slate-700 dark:text-slate-200">
                                    {currentIndex + 1} / {activeStories.length}
                                </span>
                                <span>·</span>
                                {currentStory.url && (
                                    <>
                                        <span className="font-medium text-slate-600 dark:text-slate-300">
                                            {getDomain(currentStory.url)}
                                        </span>
                                        <span>·</span>
                                    </>
                                )}
                                <span className="font-semibold text-amber-500">▲ {currentStory.score}</span>
                                <span>·</span>
                                <span>{formatRelativeTime((currentStory as any).posted_at || currentStory.time || currentStory.created_at)}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                    <MessageSquare size={12} /> {currentStory.descendants || 0}
                                </span>
                            </div>

                            {/* Headline */}
                            <h2
                                onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer mb-5"
                            >
                                {currentStory.title}
                            </h2>

                            {/* AI Summary */}
                            <div className="rounded-xl bg-slate-50 dark:bg-[#121928] border border-slate-200 dark:border-slate-800 p-5">
                                {summaryBullets.length > 0 ? (
                                    <ul className="space-y-2.5">
                                        {summaryBullets.map((bullet, idx) => (
                                            <li key={idx} className="flex items-start gap-2.5 text-sm sm:text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="flex items-center justify-between gap-4 py-2">
                                        <span className="text-sm text-slate-500 dark:text-slate-400">
                                            {summarizingIds.has(currentStory.id)
                                                ? 'Generating summary...'
                                                : 'No summary generated yet for this story.'}
                                        </span>
                                        <button
                                            onClick={() => triggerSummary(currentStory.id)}
                                            disabled={summarizingIds.has(currentStory.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-300 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                        >
                                            <Sparkles size={12} className={summarizingIds.has(currentStory.id) ? 'animate-spin' : ''} />
                                            <span>{summarizingIds.has(currentStory.id) ? 'Summarizing...' : 'Summarize'}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Clean Single-Row Footer (Never Clipped) */}
                {currentStory && (
                    <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#131a29] flex items-center justify-between gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
                            >
                                <BookOpen size={14} />
                                <span>Read Article</span>
                            </button>

                            {currentStory.url && (
                                <a
                                    href={currentStory.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#1e273d] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                                >
                                    <ExternalLink size={13} />
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
                                    className={`h-2 rounded-full transition-all cursor-pointer ${
                                        idx === currentIndex
                                            ? stage === 'postgres'
                                                ? 'w-5 bg-sky-500'
                                                : 'w-5 bg-indigo-500'
                                            : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                                    }`}
                                />
                            ))}
                        </div>

                        {/* Prev / Next */}
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handlePrev}
                                disabled={stage === 'postgres' && currentIndex === 0}
                                className="p-2 rounded-lg bg-white dark:bg-[#1e273d] hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-35 transition-colors cursor-pointer md:hidden"
                                title="Previous (←)"
                            >
                                <ChevronLeft size={14} />
                            </button>

                            {isLastPgSlide ? (
                                <button
                                    onClick={() => handleStageSwitch('ai')}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer"
                                >
                                    <span>LLM & AI</span>
                                    <ChevronRight size={14} />
                                </button>
                            ) : isLastAiSlide ? (
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-colors cursor-pointer"
                                >
                                    <span>Done</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleNext}
                                    className="flex items-center gap-1 px-3.5 py-2 rounded-lg bg-slate-800 dark:bg-slate-200 hover:bg-slate-700 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
                                >
                                    <span>Next</span>
                                    <ChevronRight size={14} />
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
                className="hidden md:flex items-center justify-center w-11 h-11 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-lg ml-4 transition-all cursor-pointer shrink-0"
            >
                <ChevronRight size={22} />
            </button>
        </div>
    );
};
