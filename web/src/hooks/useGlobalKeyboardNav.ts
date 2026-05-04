import { useEffect } from 'react';
import { useAppState } from './useAppState';
import type { Story, ReaderTab } from '../types';

export function useGlobalKeyboardNav(
    app: ReturnType<typeof useAppState>,
    scrollToIndex?: (index: number) => void
) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent | any) => {
            // If it's a real keyboard event, check if we should ignore it
            if (e instanceof KeyboardEvent && ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            // --- Feed Keyboard Navigation ---
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key) && app.currentView === 'feed') {
                if (e.preventDefault) e.preventDefault();

                // Handle Pagination Keys (PageDown/PageUp jump by 10)
                if (e.key === 'PageDown' || e.key === 'PageUp') {
                    const JUMP = 10;
                    const visibleStories = app.stories.filter((s: Story) => app.showHidden || (!app.hiddenStories.has(s.id) && !s.is_hidden));
                    let currentIndex = visibleStories.findIndex((s: Story) => s.id === app.highlightedStoryId);
                    
                    if (e.key === 'PageDown') {
                        currentIndex = Math.min(visibleStories.length - 1, currentIndex + JUMP);
                        if (currentIndex === visibleStories.length - 1 && app.hasMore) app.fetchNextPage();
                    } else {
                        currentIndex = Math.max(0, currentIndex - JUMP);
                    }

                    const nextStory = visibleStories[currentIndex];
                    if (nextStory) {
                        app.setHighlightedStoryId(nextStory.id);
                        const originalIndex = app.stories.findIndex(s => s.id === nextStory.id);
                        if (originalIndex !== -1) scrollToIndex?.(originalIndex);
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
                    const originalIndex = app.stories.findIndex(s => s.id === nextStory.id);
                    if (originalIndex !== -1) scrollToIndex?.(originalIndex);
                }
                return;
            }

            // --- Enter to Open Story ---
            if (e.key === 'Enter' && app.currentView === 'feed' && app.highlightedStoryId) {
                if (e.preventDefault) e.preventDefault();
                app.handleStorySelect(app.highlightedStoryId, 'split');
                return;
            }

            // --- Ctrl + Tab / Ctrl + Shift + Tab to Cycle Tabs & Feed ---
            if (e.ctrlKey && e.code === 'Tab') {
                if (e.preventDefault) e.preventDefault();
                const totalTabs = app.tabs.length;
                
                if (e.shiftKey) {
                    // Cycle Left (Backwards)
                    if (app.currentView === 'feed') {
                        if (app.primaryTab === 'bookmarks') {
                            app.setPrimaryTab('feed');
                        } else if (totalTabs > 0) {
                            app.handleStorySelect(app.tabs[totalTabs - 1].storyId);
                        }
                    } else {
                        const idx = app.tabs.findIndex((t: ReaderTab) => t.id === app.activeTabId);
                        if (idx > 0) {
                            app.handleStorySelect(app.tabs[idx - 1].storyId);
                        } else {
                            app.setCurrentView('feed');
                            app.setPrimaryTab('bookmarks');
                        }
                    }
                } else {
                    // Cycle Right (Forwards)
                    if (app.currentView === 'feed') {
                        if (app.primaryTab === 'feed') {
                            app.setPrimaryTab('bookmarks');
                        } else if (totalTabs > 0) {
                            app.handleStorySelect(app.tabs[0].storyId);
                        } else {
                            app.setPrimaryTab('feed');
                        }
                    } else {
                        const idx = app.tabs.findIndex((t: ReaderTab) => t.id === app.activeTabId);
                        if (idx !== -1 && idx < totalTabs - 1) {
                            app.handleStorySelect(app.tabs[idx + 1].storyId);
                        } else {
                            app.setCurrentView('feed');
                            app.setPrimaryTab('feed');
                        }
                    }
                }
                return;
            }

            // --- F5 to Refresh ---
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                // In electron, Ctrl+R is usually handled by the menu, but we map F5 here.
                if (e.preventDefault) e.preventDefault();
                if (app.currentView === 'feed') {
                    app.handleRefresh();
                } else if (app.activeTabId) {
                    app.handleRefreshTab(app.activeTabId);
                }
                return;
            }

            // --- Ctrl + Alt + Right/Left to Toggle Tab Mode ---
            if (e.ctrlKey && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
                if (e.preventDefault) e.preventDefault();
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
                if (e.preventDefault) e.preventDefault();
                if (app.currentView !== 'reader' || !app.activeTabId) return;

                const tab = app.tabs.find((t: ReaderTab) => t.id === app.activeTabId);
                if (!tab) return;

                const order: ('article' | 'discussion' | 'split')[] = ['article', 'discussion', 'split'];
                const currentIndex = order.indexOf(tab.mode || 'split');
                const nextIndex = (currentIndex + 1) % order.length;

                app.handleStorySelect(tab.storyId, order[nextIndex]);
                return;
            }

            // --- Ctrl + 0 to switch to feed ---
            if (e.ctrlKey && e.key === '0') {
                if (e.preventDefault) e.preventDefault();
                app.setCurrentView('feed');
                return;
            }

            // --- Ctrl + W to close tab or exit ---
            if (e.ctrlKey && e.key === 'w') {
                if (e.preventDefault) e.preventDefault();
                if (app.currentView === 'reader' && app.activeTabId) {
                    app.closeTab(app.activeTabId);
                } else if (app.currentView === 'feed') {
                    (window as any).electronAPI?.close();
                }
                return;
            }

            // --- Ctrl + D to Bookmarks View ---
            if (e.ctrlKey && e.key.toLowerCase() === 'd') {
                if (e.preventDefault) e.preventDefault();
                app.setCurrentView('feed');
                app.setPrimaryTab('bookmarks');
                return;
            }

            // --- Alt + D to Focus Address Bar ---
            if (e.altKey && e.key.toLowerCase() === 'd') {
                // This is handled by a direct listener in ReaderPane, but we want to make sure it's bubbleable
                return;
            }

            // --- Ctrl + Home to Feed View ---
            if (e.ctrlKey && e.key === 'Home') {
                if (app.currentView === 'reader') {
                    if (e.preventDefault) e.preventDefault();
                    app.setCurrentView('feed');
                    app.setPrimaryTab('feed');
                    return;
                }
                // If already on feed, let existing offset-0 logic handle it
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        // Listen for forwarded shortcuts from Electron main process (webviews)
        if ((window as any).electronAPI?.onGlobalShortcut) {
            (window as any).electronAPI.onGlobalShortcut((data: any) => {
                handleKeyDown(data);
            });
        }

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [app, scrollToIndex]);
}
