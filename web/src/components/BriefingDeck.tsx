import React, { useState, useEffect, useCallback } from 'react';
import {
    Zap, ChevronLeft, ChevronRight, BookOpen, ExternalLink,
    MessageSquare, Sparkles, Play, Pause, X, Database, Cpu,
    CheckCircle2, RefreshCw, Layers
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

    const fetchBriefingStories = useCallback(async () => {
        if (!apiBase) return;
        setLoading(true);
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
            setLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (isOpen) {
            fetchBriefingStories();
        }
    }, [isOpen, fetchBriefingStories]);

    const activeStories = stage === 'postgres' ? pgStories : aiStories;
    const currentStory = activeStories[currentIndex] || null;

    // Prioritize summaries for all stories in the active deck
    useEffect(() => {
        if (!isOpen || !apiBase || activeStories.length === 0) return;
        const unsummarizedIds = activeStories
            .filter(s => !s.summary || !s.summary.trim())
            .map(s => s.id);
        if (unsummarizedIds.length > 0) {
            fetchWithAuth(`${apiBase}/api/summary/prioritize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ story_ids: unsummarizedIds }),
            }).catch(() => {});
        }
    }, [isOpen, apiBase, activeStories]);

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
            await fetchBriefingStories();
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
        <div className="fixed inset-0 z-[250] bg-slate-900/75 dark:bg-[#0b0f19]/85 backdrop-blur-md flex items-center justify-center p-4 md:p-8 select-none animate-in fade-in duration-150">
            <div className="w-full max-w-4xl bg-white dark:bg-[#161d2e] border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Top Auto-Advance Progress Bar */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                        className={`h-full transition-all duration-100 ${
                            stage === 'postgres'
                                ? 'bg-gradient-to-r from-sky-500 to-indigo-500'
                                : 'bg-gradient-to-r from-amber-500 to-orange-500'
                        }`}
                        style={{
                            width: isPlaying
                                ? `${progress}%`
                                : `${activeStories.length > 0 ? ((currentIndex + 1) / activeStories.length) * 100 : 100}%`,
                        }}
                    />
                </div>

                {/* Briefing Header & Track Switcher */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#131824]/80">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-600 dark:text-orange-400">
                            <Zap size={13} className="fill-current" />
                            <span className="text-[11px] font-black uppercase tracking-wider">Flash Briefing</span>
                        </div>

                        {/* Priority Track Stepper */}
                        <div className="flex items-center bg-slate-200/70 dark:bg-[#1e273d] p-1 rounded-xl border border-slate-300/60 dark:border-slate-700/80">
                            <button
                                onClick={() => handleStageSwitch('postgres')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    stage === 'postgres'
                                        ? 'bg-sky-600 text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <Database size={12} />
                                <span>1. Postgres Latest</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-extrabold">
                                    {pgStories.length}
                                </span>
                            </button>

                            <ChevronRight size={13} className="text-slate-400 mx-0.5" />

                            <button
                                onClick={() => handleStageSwitch('ai')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                    stage === 'ai'
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <Cpu size={12} />
                                <span>2. LLM & AI Latest</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-extrabold">
                                    {aiStories.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Right Controls: Auto-Play, Auto-Focus Toggle, Refresh, Close */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsPlaying(p => !p)}
                            title={isPlaying ? 'Pause automatic slide advance' : 'Auto-advance slides every 14s'}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                isPlaying
                                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-white dark:bg-[#1e273d] border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                            }`}
                        >
                            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                            <span>{isPlaying ? 'Playing' : 'Slideshow'}</span>
                        </button>

                        <button
                            onClick={() => onToggleAutoShowOnFocus(!autoShowOnFocus)}
                            title="Automatically open Flash Briefing when switching back to HN Station"
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                autoShowOnFocus
                                    ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-300'
                                    : 'bg-white dark:bg-[#1e273d] border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            <Layers size={12} />
                            <span className="hidden sm:inline">On App Switch: {autoShowOnFocus ? 'ON' : 'OFF'}</span>
                        </button>

                        <button
                            onClick={fetchBriefingStories}
                            title="Refresh latest briefing stories"
                            className="p-1.5 rounded-lg bg-white dark:bg-[#1e273d] border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-indigo-500 transition-colors cursor-pointer"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-500' : ''} />
                        </button>

                        <button
                            onClick={onClose}
                            title="Close Briefing (Esc)"
                            className="p-1.5 rounded-lg bg-white dark:bg-[#1e273d] border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Slide Body */}
                <div className="p-6 md:p-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-between min-h-[380px]">
                    {loading && activeStories.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <RefreshCw size={28} className="animate-spin text-indigo-500" />
                            <span className="text-sm font-semibold">Loading latest {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} stories...</span>
                        </div>
                    ) : !currentStory ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-12">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                {stage === 'postgres' ? <Database size={24} /> : <Cpu size={24} />}
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">
                                    No {stage === 'postgres' ? 'Postgres' : 'LLM & AI'} stories in local DB yet
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md">
                                    Background ingestion is syncing stories from Hacker News. Click Refresh in a moment to view your slides.
                                </p>
                            </div>
                            {stage === 'postgres' && aiStories.length > 0 && (
                                <button
                                    onClick={() => handleStageSwitch('ai')}
                                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                                >
                                    Continue to LLM & AI Briefing ({aiStories.length}) →
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Top Metadata Row */}
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span
                                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                stage === 'postgres'
                                                    ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border border-sky-500/30'
                                                    : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30'
                                            }`}
                                        >
                                            {stage === 'postgres' ? 'Priority #1 • Postgres' : 'Priority #2 • LLM / AI'} • Slide {currentIndex + 1} of {activeStories.length}
                                        </span>

                                        {currentStory.url && (
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#1e273d] px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                                                {getDomain(currentStory.url)}
                                            </span>
                                        )}

                                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                            ▲ {currentStory.score} pts
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

                                    {/* Topic Pills */}
                                    <div className="flex items-center gap-1.5">
                                        {(currentStory.topics || []).slice(0, 4).map(t => {
                                            const style = getTagStyle(t);
                                            return (
                                                <span
                                                    key={t}
                                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold border"
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
                                    className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer mb-6"
                                >
                                    {currentStory.title}
                                </h2>

                                {/* AI Flash Summary Card */}
                                <div className="rounded-xl bg-slate-50 dark:bg-[#1e273d]/90 border border-slate-200/90 dark:border-slate-700/90 p-5 shadow-inner">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={15} className="text-amber-500" />
                                            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                                Executive Summary
                                            </span>
                                        </div>
                                        {summaryBullets.length === 0 && (
                                            <button
                                                onClick={() => triggerSummary(currentStory.id)}
                                                disabled={summarizingIds.has(currentStory.id)}
                                                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                <Sparkles size={12} className={summarizingIds.has(currentStory.id) ? 'animate-spin' : ''} />
                                                <span>{summarizingIds.has(currentStory.id) ? 'Summarizing with Local AI...' : 'Generate Summary Now'}</span>
                                            </button>
                                        )}
                                    </div>

                                    {summaryBullets.length > 0 ? (
                                        <ul className="space-y-2.5">
                                            {summaryBullets.map((bullet, idx) => (
                                                <li key={idx} className="flex items-start gap-2.5 text-sm md:text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 shrink-0" />
                                                    <span>{bullet}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="py-4 text-sm text-slate-500 dark:text-slate-300 flex items-center justify-between gap-4">
                                            <span>
                                                {summarizingIds.has(currentStory.id)
                                                    ? 'Generating summary on local Efficiency cores...'
                                                    : 'Queued for priority local AI summarization — or click "Go Deep" to read the full article right away.'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Primary Action Row */}
                            <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                                {/* Left: Go Deep + External Links */}
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <button
                                        onClick={() => onGoDeep(currentStory.id, stage, currentIndex)}
                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs md:text-sm font-extrabold shadow-lg shadow-orange-500/20 transition-all cursor-pointer active:scale-[0.99]"
                                    >
                                        <BookOpen size={16} />
                                        <span>Go Deep — Open Article & Discussion</span>
                                    </button>

                                    {currentStory.url && (
                                        <a
                                            href={currentStory.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors"
                                        >
                                            <ExternalLink size={14} />
                                            <span>Browser</span>
                                        </a>
                                    )}

                                    <button
                                        onClick={() => {
                                            onJumpToTopicFeed(stage === 'postgres' ? ['Postgres'] : ['LLM', 'AI']);
                                            onClose();
                                        }}
                                        className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                                    >
                                        <span>View All {stage === 'postgres' ? '#Postgres' : '#LLM / #AI'} in Feed</span>
                                    </button>
                                </div>

                                {/* Right: Slide Dots & Prev/Next / Stage Transition */}
                                <div className="flex items-center gap-3">
                                    {/* Slide Dots */}
                                    <div className="flex items-center gap-1.5 mr-2">
                                        {activeStories.map((s, idx) => (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    setCurrentIndex(idx);
                                                    setProgress(0);
                                                }}
                                                title={`Slide ${idx + 1}: ${s.title}`}
                                                className={`h-2 rounded-full transition-all cursor-pointer ${
                                                    idx === currentIndex
                                                        ? stage === 'postgres'
                                                            ? 'w-6 bg-sky-500'
                                                            : 'w-6 bg-indigo-500'
                                                        : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                                                }`}
                                            />
                                        ))}
                                    </div>

                                    <button
                                        onClick={handlePrev}
                                        disabled={stage === 'postgres' && currentIndex === 0}
                                        className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#1e273d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
                                        title="Previous Slide (←)"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    {isLastPgSlide ? (
                                        <button
                                            onClick={() => handleStageSwitch('ai')}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs md:text-sm font-extrabold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                                        >
                                            <Cpu size={15} />
                                            <span>Next: LLM & AI Briefing →</span>
                                        </button>
                                    ) : isLastAiSlide ? (
                                        <button
                                            onClick={onClose}
                                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs md:text-sm font-extrabold shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
                                        >
                                            <CheckCircle2 size={15} />
                                            <span>Finish Briefing</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleNext}
                                            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 dark:bg-slate-100 hover:bg-slate-700 dark:hover:bg-white text-white dark:text-slate-900 text-xs md:text-sm font-extrabold transition-all cursor-pointer"
                                            title="Next Slide (→ or Space)"
                                        >
                                            <span>Next</span>
                                            <ChevronRight size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
