import { useEffect } from 'react';
import { useAppState } from './useAppState';
import type { Story, ReaderTab } from '../types';

export function useGlobalKeyboardNav(
    app: ReturnType<typeof useAppState>,
    storyRefs: React.MutableRefObject<(HTMLDivElement | null)[]>
) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            // --- Feed Keyboard Navigation ---
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key) && app.currentView === 'feed') {
                e.preventDefault();

                // Handle Pagination Keys (PageDown/PageUp or Ctrl+Home/Ctrl+End)
                if (e.key === 'PageDown' || e.key === 'PageUp' || (e.ctrlKey && (e.key === 'Home' || e.key === 'End'))) {
                    const PAGE_SIZE = 10;
                    if (e.key === 'PageDown' && app.hasMore) {
                        app.setOffset?.(app.offset + PAGE_SIZE);
                    } else if (e.key === 'PageUp' && app.offset > 0) {
                        app.setOffset?.(Math.max(0, app.offset - PAGE_SIZE));
                    } else if (e.ctrlKey && e.key === 'Home') {
                        app.setOffset?.(0);
                    } else if (e.ctrlKey && e.key === 'End') {
                        const total = app.totalStories || 0;
                        if (total > 0) {
                            const lastPageOffset = Math.max(0, Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE);
                            app.setOffset?.(lastPageOffset);
                        }
                    }
                    return;
                }

                const visibleStories = app.stories.filter((s: Story) => app.showHidden || (!app.hiddenStories.has(s.id) && !s.is_hidden));
                if (visibleStories.length === 0) return;

                let currentIndex = visibleStories.findIndex((s: Story) => s.id === app.highlightedStoryId);

                if (e.key === 'ArrowDown') {
                    if (currentIndex === -1) currentIndex = 0;
                    else if (currentIndex < visibleStories.length - 1) currentIndex++;
                } else if (e.key === 'ArrowUp') {
                    if (currentIndex === -1) currentIndex = visibleStories.length - 1;
                    else if (currentIndex > 0) currentIndex--;
                } else if (e.key === 'Home') {
                    currentIndex = 0;
                } else if (e.key === 'End') {
                    currentIndex = visibleStories.length - 1;
                }

                const nextStory = visibleStories[currentIndex];
                if (nextStory) {
                    app.setHighlightedStoryId(nextStory.id);
                    // Scroll to the element
                    const el = document.getElementById(`story-${nextStory.id}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
                return;
            }

            // --- Enter to Open Story ---
            if (e.key === 'Enter' && app.currentView === 'feed' && app.highlightedStoryId) {
                e.preventDefault();
                app.handleStorySelect(app.highlightedStoryId, 'split');
                return;
            }

            // --- Ctrl + Tab / Ctrl + Shift + Tab to Cycle Tabs & Feed ---
            if (e.ctrlKey && e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Cycle Left (Backwards)
                    if (app.currentView === 'feed') {
                        if (app.tabs.length > 0) {
                            app.handleStorySelect(app.tabs[app.tabs.length - 1].storyId);
                        }
                    } else {
                        const idx = app.tabs.findIndex((t: ReaderTab) => t.id === app.activeTabId);
                        if (idx > 0) {
                            app.handleStorySelect(app.tabs[idx - 1].storyId);
                        } else {
                            app.setCurrentView('feed');
                        }
                    }
                } else {
                    // Cycle Right (Forwards)
                    if (app.currentView === 'feed') {
                        if (app.tabs.length > 0) {
                            app.handleStorySelect(app.tabs[0].storyId);
                        }
                    } else {
                        const idx = app.tabs.findIndex((t: ReaderTab) => t.id === app.activeTabId);
                        if (idx !== -1 && idx < app.tabs.length - 1) {
                            app.handleStorySelect(app.tabs[idx + 1].storyId);
                        } else {
                            app.setCurrentView('feed');
                        }
                    }
                }
                return;
            }

            // --- Ctrl + Alt + Right/Left to Toggle Tab Mode ---
            if (e.ctrlKey && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                e.preventDefault();
                if (!app.activeTabId) return;

                const tab = app.tabs.find((t: ReaderTab) => t.id === app.activeTabId);
                if (!tab) return;

                const modes: ('article' | 'split' | 'discussion')[] = ['article', 'split', 'discussion'];
                const currentIndex = modes.indexOf(tab.mode);
                let nextIndex = currentIndex;

                if (e.key === 'ArrowRight') {
                    nextIndex = (currentIndex + 1) % modes.length;
                } else {
                    nextIndex = (currentIndex - 1 + modes.length) % modes.length;
                }

                app.handleStorySelect(tab.storyId, modes[nextIndex]);
                return;
            }

            // --- Ctrl + Space to cycle Article -> Discussion -> Split ---
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                if (app.currentView !== 'reader' || !app.activeTabId) return;

                const tab = app.tabs.find((t: ReaderTab) => t.id === app.activeTabId);
                if (!tab) return;

                const order: ('article' | 'discussion' | 'split')[] = ['article', 'discussion', 'split'];
                const currentIndex = order.indexOf(tab.mode || 'split');
                const nextIndex = (currentIndex + 1) % order.length;

                app.handleStorySelect(tab.storyId, order[nextIndex]);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [app, storyRefs]);
}
