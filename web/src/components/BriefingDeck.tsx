import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, BookOpen, ExternalLink,
    MessageSquare, Sparkles, Play, Pause, Database, Cpu,
    CheckCircle2, RefreshCw, Layers, ListFilter
} from 'lucide-react';
import type { Story } from '../types';
import { fetchWithAuth } from '../utils/api';
import { getTagStyle } from '../utils/colors';

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
    onJumpToTopicFeed: (topics: string[]) => void;
    autoShowOnFocus: boolean;
    onToggleAutoShowOnFocus: (enabled: boolean) => void;
}

const SLIDE_DURATION_MS = 14000;

export const BriefingDeck: React.FC<BriefingDeckProps> = ({
    apiBase,
    isOpen,
    initialStage = 'postgres',
    onClose,
    onGoDeep,
    onSummarizeStory,
    onJumpToTopicFeed,
    autoShowOnFocus,
    onToggleAutoShowOnFocus,
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
            console.error('Failed to load briefing stories:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (!isOpen) return;
        fetchBriefingStories(false);
        // Poll every 8s while open so background local AI summaries appear automatically as they finish
        const pollTimer = setInterval(() => {
            fetchBriefingStories(true);
        }, 8000);
        return () => clearInterval(pollTimer);
    }, [isOpen, fetchBriefingStories]);

    const activeStories = stage === 'postgres' ? pgStories : aiStories;
    const currentStory = activeStories[currentIndex] || null;

    // Prioritize summaries for all stories in both briefing tracks
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

    // Auto-advance slideshow timer when playing
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
        } else if (stage === 'postgres') {
            setStage('ai');
            setCurrentIndex(0);
        } else {
            onClose();
        }
    }, [currentIndex, activeStories.length, stage, onClose]);

    // Keyboard navigation inside Briefing Deck
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'ArrowRight' || e.key === ' ') {
                e.preventDefault();
                handleNext();
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrev();
            } else if (e.key === 'Enter' && currentStory) {
                e.preventDefault();
                onGoDeep(currentStory.id, stage, currentIndex);
            } else if (e.key >= '1' && e.key <= '5') {
                const idx = parseInt(e.key, 10) - 1;
                if (idx < activeStories.length) {
                    e.preventDefault();
                    setCurrentIndex(idx);
                    setProgress(0);
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, handleNext, handlePrev, currentStory, onGoDeep, stage, currentIndex, activeStories.length]);

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
        <div className="flex-1 h-full w-full bg-slate-50 dark:bg-[#131824] flex flex-col overflow-hidden select-none">
            {/* Sub-header: Stage Switcher + Slideshow Controls */}
            <div className="px-6 py-3 bg-white dark:bg-[#161d2e] border-b border-slate-200 dark:border-slate-800/90 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    {/* Priority Track Stepper */}
                    <div className="flex items-center bg-slate-100 dark:bg-[#1e273d] p-1 rounded-xl border border-slate-200 dark:border-slate-700/80">
                        <button
                            onClick={() => handleStageSwitch('postgres')}
                            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                stage === 'postgres'
                                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/20'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Database size={13} />
                            <span>1. Postgres Flash (Top {pgStories.length || 5})</span>
                        </button>

                        <ChevronRight size={14} className="text-slate-400 mx-1" />

                        <button
                            onClick={() => handleStageSwitch('ai')}
                            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                stage === 'ai'
                                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Cpu size={13} />
                            <span>2. LLM & AI Flash (Top {aiStories.length || 5})</span>
                        </button>
                    </div>

                    <span className="text-[11px] font-medium text-slate-400 hidden xl:inline">
                        Use <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">←</kbd>{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">→</kbd> or{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">1-5</kbd> to flip slides,{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px]">Enter</kbd> to Go Deep
                    </span>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsPlaying(p => !p)}
                        title={isPlaying ? 'Pause automatic slide advance' : 'Auto-advance slides every 14s'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            isPlaying
                                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-[#1e273d] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                        }`}
                    >
                        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                        <span>{isPlaying ? 'Auto-Play: ON' : 'Auto-Play'}</span>
                    </button>

                    <button
                        onClick={() => onToggleAutoShowOnFocus(!autoShowOnFocus)}
                        title="Automatically show Postgres Flash Briefing whenever you switch back to HN Station"
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            autoShowOnFocus
                                ? 'bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-sky-300'
                                : 'bg-slate-100 dark:bg-[#1e273d] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                        }`}
                    >
                        <Layers size={13} />
                        <span className="hidden md:inline">Flash on App Switch: {autoShowOnFocus ? 'ON' : 'OFF'}</span>
                    </button>

                    <button
                        onClick={() => fetchBriefingStories(false)}
                        title="Refresh latest briefing stories"
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#1e273d] border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-500 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-500' : ''} />
                    </button>

                    <button
                        onClick={onClose}
                        title="Switch to Full Feed List View"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                    >
                        <ListFilter size={13} />
                        <span>All Feed List</span>
                    </button>
                </div>
            </div>

            {/* 5-Slide Thumbnail Strip (Quick Jump Rail) */}
            {activeStories.length > 0 && (
                <div className="px-6 pt-4 pb-2 grid grid-cols-5 gap-3 max-w-6xl w-full mx-auto shrink-0">
                    {activeStories.map((s, idx) => {
                        const isCurrent = idx === currentIndex;
                        const hasSummary = Boolean(s.summary && s.summary.trim());
                        return (
                            <button
                                key={s.id}
                                onClick={() => {
                                    setCurrentIndex(idx);
                                    setProgress(0);
                                }}
                                className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1.5 relative overflow-hidden ${
                                    isCurrent
                                        ? stage === 'postgres'
                                            ? 'bg-white dark:bg-[#1c263b] border-sky-500/80 ring-2 ring-sky-500/25 shadow-lg'
                                            : 'bg-white dark:bg-[#1c263b] border-indigo-500/80 ring-2 ring-indigo-500/25 shadow-lg'
                                        : 'bg-white/60 dark:bg-[#161d2e]/70 border-slate-200/80 dark:border-slate-800 hover:bg-white dark:hover:bg-[#1a2234] opacity-75 hover:opacity-100'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-1 w-full">
                                    <span
                                        className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded ${
                                            isCurrent
                                                ? stage === 'postgres'
                                                    ? 'bg-sky-500 text-white'
                                                    : 'bg-indigo-500 text-white'
                                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                        }`}
                                    >
                                        Slide {idx + 1}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-semibold">
                                        {formatRelativeTime((s as any).posted_at || s.time || s.created_at)}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                                    {s.title}
                                </p>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                                    <span className="text-amber-500 font-bold">▲ {s.score}</span>
                                    {hasSummary ? (
                                        <span className="text-emerald-500 dark:text-emerald-400 font-bold flex items-center gap-0.5">
                                            <Sparkles size={9} /> AI Ready
                                        </span>
                                    ) : (
                                        <span className="text-slate-400">Queued</span>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Main Slide Deck Card */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4 flex items-center justify-center">
                <div className="max-w-5xl w-full bg-white dark:bg-[#182032] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                    {/* Slide Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-150 ${
                                stage === 'postgres'
                                    ? 'bg-gradient-to-r from-sky-500 to-indigo-500'
                                    : 'bg-gradient-to-r from-indigo-500 to-amber-500'
                            }`}
                            style={{
                                width: isPlaying
                                    ? `${progress}%`
                                    : `${activeStories.length > 0 ? ((currentIndex + 1) / activeStories.length) * 100 : 100}%`,
                            }}
                        />
                    </div>

                    <div className="p-6 md:p-8 flex flex-col justify-between gap-6">
                        {loading && activeStories.length === 0 ? (
                            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                                <RefreshCw size={28} className="animate-spin text-sky-500" />
                                <span className="text-sm font-semibold">
                                    Loading latest {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} slides...
                                </span>
                            </div>
                        ) : !currentStory ? (
                            <div className="py-14 flex flex-col items-center justify-center gap-4 text-center">
                                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                    {stage === 'postgres' ? <Database size={24} /> : <Cpu size={24} />}
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">
                                        Syncing {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} stories from Hacker News...
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                                        Click Refresh in a moment to view your slides.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div>
                                    {/* Metadata Row */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <span
                                                className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                                                    stage === 'postgres'
                                                        ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30'
                                                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                                                }`}
                                            >
                                                {stage === 'postgres' ? 'Postgres Flash' : 'LLM & AI Flash'} • {currentIndex + 1} / {activeStories.length}
                                            </span>

                                            {currentStory.url && (
                                                <span className="text-xs font-bold text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-[#1e273d] px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                                                    {getDomain(currentStory.url)}
                                                </span>
                                            )}

                                            <span className="text-xs font-extrabold text-amber-500">
                                                ▲ {currentStory.score} points
                                            </span>

                                            <span className="text-xs text-slate-400">•</span>

                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-300">
                                                {formatRelativeTime((currentStory as any).posted_at || currentStory.time || currentStory.created_at)} by {currentStory.by}
                                            </span>

                                            <span className="text-xs text-slate-400">•</span>

                                            <span className="text-xs font-medium text-slate-500 dark:text-slate-300 flex items-center gap-1">
                                                <MessageSquare size={12} /> {currentStory.descendants || 0} comments
                                            </span>
                                        </div>

                                        {/* Topic Badges */}
                                        <div className="flex items-center gap-1.5">
                                            {(currentStory.topics || []).slice(0, 4).map(t => {
                                                const style = getTagStyle(t);
                                                return (
                                                    <span
                                                        key={t}
                                                        className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                                                        style={{ backgroundColor: style.bg, color: style.color, borderColor: style.border }}
                                                    >
                                                        #{t}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Slide Headline */}
                                    <h2
                                        onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                        className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer mb-6"
                                    >
                                        {currentStory.title}
                                    </h2>

                                    {/* Executive AI Summary Box */}
                                    <div className="rounded-xl bg-slate-50 dark:bg-[#1e273d]/90 border border-slate-200/90 dark:border-slate-700/90 p-5 md:p-6 shadow-inner">
                                        <div className="flex items-center justify-between mb-3.5">
                                            <div className="flex items-center gap-2">
                                                <Sparkles size={16} className="text-amber-500" />
                                                <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                                    AI Flash Summary
                                                </span>
                                            </div>
                                            {summaryBullets.length === 0 && (
                                                <button
                                                    onClick={() => triggerSummary(currentStory.id)}
                                                    disabled={summarizingIds.has(currentStory.id)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                                                >
                                                    <Sparkles size={12} className={summarizingIds.has(currentStory.id) ? 'animate-spin' : ''} />
                                                    <span>{summarizingIds.has(currentStory.id) ? 'Summarizing now...' : 'Summarize Now'}</span>
                                                </button>
                                            )}
                                        </div>

                                        {summaryBullets.length > 0 ? (
                                            <ul className="space-y-3">
                                                {summaryBullets.map((bullet, idx) => (
                                                    <li key={idx} className="flex items-start gap-3 text-[15px] md:text-base text-slate-700 dark:text-slate-100 leading-relaxed">
                                                        <span className="w-2 h-2 rounded-full bg-amber-500 mt-2 shrink-0" />
                                                        <span>{bullet}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="py-4 text-sm text-slate-500 dark:text-slate-300 flex items-center justify-between gap-4">
                                                <span>
                                                    {summarizingIds.has(currentStory.id)
                                                        ? 'Generating summary on local Efficiency cores...'
                                                        : 'Prioritized at the front of the local AI summary queue — click "Summarize Now" for instant summary or "Go Deep" to read the article.'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Bottom Action Bar */}
                                <div className="pt-4 border-t border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button
                                            onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-extrabold shadow-lg shadow-orange-500/20 transition-all cursor-pointer active:scale-[0.99]"
                                        >
                                            <BookOpen size={16} />
                                            <span>Go Deep — Open Article & Discussion</span>
                                        </button>

                                        {currentStory.url && (
                                            <a
                                                href={currentStory.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors"
                                            >
                                                <ExternalLink size={14} />
                                                <span>Open in Browser</span>
                                            </a>
                                        )}

                                        <button
                                            onClick={() => {
                                                onJumpToTopicFeed(stage === 'postgres' ? ['Postgres'] : ['LLM', 'AI']);
                                                onClose();
                                            }}
                                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                        >
                                            <span>See All {stage === 'postgres' ? '#Postgres' : '#LLM / #AI'} Stories in List</span>
                                        </button>
                                    </div>

                                    {/* Slide Prev / Next / Stage Transition */}
                                    <div className="flex items-center gap-2.5">
                                        <button
                                            onClick={handlePrev}
                                            disabled={stage === 'postgres' && currentIndex === 0}
                                            className="flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-xs font-bold transition-colors cursor-pointer"
                                            title="Previous Slide (←)"
                                        >
                                            <ChevronLeft size={16} />
                                            <span>Prev</span>
                                        </button>

                                        {isLastPgSlide ? (
                                            <button
                                                onClick={() => handleStageSwitch('ai')}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-extrabold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                                            >
                                                <Cpu size={16} />
                                                <span>Done with PG → Go to LLM & AI Slides</span>
                                                <ChevronRight size={16} />
                                            </button>
                                        ) : isLastAiSlide ? (
                                            <button
                                                onClick={onClose}
                                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                                            >
                                                <CheckCircle2 size={16} />
                                                <span>Finish Briefing → Open Full Feed</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleNext}
                                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-extrabold shadow-md transition-all cursor-pointer"
                                                title="Next Slide (→ or Space)"
                                            >
                                                <span>Next Slide</span>
                                                <ChevronRight size={16} />
                                            </button>
                                        )}

                                        {stage === 'postgres' && !isLastPgSlide && (
                                            <button
                                                onClick={() => handleStageSwitch('ai')}
                                                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 text-xs font-extrabold transition-all cursor-pointer"
                                                title="Skip remaining Postgres slides and jump to LLM & AI slides"
                                            >
                                                <Cpu size={14} />
                                                <span>Skip to LLM/AI →</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
