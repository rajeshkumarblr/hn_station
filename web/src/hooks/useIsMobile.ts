import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 768) {
    // Use a default boolean on SSR/initial render, fallback to true if window is undefined
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            setIsMobile(window.innerWidth < breakpoint);
        };

        // Attach listener
        window.addEventListener('resize', handleResize);

        // Call once to ensure state is accurate
        handleResize();

        return () => window.removeEventListener('resize', handleResize);
    }, [breakpoint]);

    return isMobile;
}
