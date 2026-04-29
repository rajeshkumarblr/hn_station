
/**
 * Returns a deterministic but distinct color from a predefined palette.
 * Avoids yellow/amber to prevent collision with selection states.
 */
export function getTagStyle(tag: string): { color: string; bg: string; border: string } {
    const COLORS = [
        '#3b82f6', // blue-500
        '#10b981', // emerald-500
        '#8b5cf6', // violet-500
        '#f43f5e', // rose-500
        '#06b6d4', // cyan-500
        '#f97316', // orange-500
        '#ec4899', // pink-500
        '#6366f1', // indigo-500
        '#14b8a6', // teal-500
        '#ef4444', // red-500
        '#0ea5e9', // sky-500
        '#a855f7', // purple-500
    ];

    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const index = Math.abs(hash) % COLORS.length;
    const color = COLORS[index];
    
    return {
        color: color,
        bg: `${color}1A`, // 10% opacity hex
        border: `${color}4D` // 30% opacity hex
    };
}

/**
 * Returns a neutral, "hint" style for topics that haven't been promoted to filters.
 */
export function getNeutralTagStyle(): { color: string; bg: string; border: string } {
    return {
        color: '#94a3b8', // slate-400
        bg: 'transparent',
        border: '#e2e8f033' // slate-200 with low opacity
    };
}
