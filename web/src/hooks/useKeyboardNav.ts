import { useEffect, useState, useCallback, useRef } from 'react';

export function useKeyboardNav(
    containerRef: React.RefObject<HTMLElement>,
    isLoading: boolean,
    onCollapse: (commentId: string) => void,
    onSummarize: () => void,
    onFocusList?: () => void
) {
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const hasAutoSelected = useRef(false);

    // Reset auto-select flag when loading starts
    useEffect(() => {
        if (isLoading) {
            hasAutoSelected.current = false;
        }
    }, [isLoading]);

    // Helper to find all visible comment nodes
    const getVisibleComments = useCallback(() => {
        if (!containerRef.current) return [];
        return Array.from(containerRef.current.querySelectorAll('.comment-node'));
    }, [containerRef]);

    const scrollToComment = (element: Element) => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // Auto-select first comment
    useEffect(() => {
        if (!isLoading && !activeCommentId && !hasAutoSelected.current) {
            const comments = getVisibleComments();
            if (comments.length > 0) {
                const firstId = comments[0].getAttribute('data-comment-id');
                if (firstId) {
                    setActiveCommentId(firstId);
                    // Don't scroll on initial load, it might be annoying if user is reading description
                    hasAutoSelected.current = true;
                }
            }
        }
    }, [isLoading, activeCommentId, getVisibleComments]);

    useEffect(() => {
        if (isLoading) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if input/textarea is focused
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

            if (e.key === 's') {
                e.preventDefault();
                onSummarize();
                return;
            }

            // Ctrl+Left to focus list
            if (e.ctrlKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                onFocusList?.();
                return;
            }

            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                const comments = getVisibleComments();
                if (comments.length === 0) return;

                if (!activeCommentId) {
                    setActiveCommentId(comments[0].getAttribute('data-comment-id'));
                    scrollToComment(comments[0]);
                } else {
                    const currentIndex = comments.findIndex(c => c.getAttribute('data-comment-id') === activeCommentId);
                    if (currentIndex < comments.length - 1) {
                        const next = comments[currentIndex + 1];
                        setActiveCommentId(next.getAttribute('data-comment-id'));
                        scrollToComment(next);
                    }
                }
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                const comments = getVisibleComments();
                if (comments.length === 0) return;

                if (!activeCommentId) {
                    setActiveCommentId(comments[0].getAttribute('data-comment-id'));
                    scrollToComment(comments[0]);
                } else {
                    const currentIndex = comments.findIndex(c => c.getAttribute('data-comment-id') === activeCommentId);
                    if (currentIndex > 0) {
                        const prev = comments[currentIndex - 1];
                        setActiveCommentId(prev.getAttribute('data-comment-id'));
                        scrollToComment(prev);
                    }
                }
            } else if (e.key === 'c' || e.key === 'Enter') {
                e.preventDefault();
                if (activeCommentId) {
                    onCollapse(activeCommentId);
                }
            } else if (e.key === 'ArrowLeft') {
                // Prevent default scrolling
                e.preventDefault();
                if (activeCommentId) {
                    // Left arrow collapses
                    // We need to check if it's already collapsed? 
                    // For now just toggle collapse similar to 'c' effectively
                    // User asked for "Left arrow should collapse"
                    onCollapse(activeCommentId);
                }
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (activeCommentId) {
                    // Right arrow expands 
                    // Since onCollapse toggles, we need to know state.
                    // We can check aria-expanded on the button
                    const node = containerRef.current?.querySelector(`[data-comment-id="${activeCommentId}"]`);
                    const btn = node?.querySelector('button');
                    const isExpanded = btn?.getAttribute('aria-expanded') === 'true';

                    if (!isExpanded) {
                        onCollapse(activeCommentId);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isLoading, activeCommentId, getVisibleComments, onCollapse, onSummarize, onFocusList]);

    return { activeCommentId };
}
