
/**
 * Returns a deterministic but distinct color from a predefined palette.
 * Avoids yellow/amber to prevent collision with selection states.
 */
export function getTagStyle(tag: string): { color: string; bg: string; border: string } {
    const COLORS = [
        '#64748b', // slate-500
        '#3b82f6', // blue-500
        '#f97316', // orange-500
        '#f59e0b', // amber-500
        '#475569', // slate-600
        '#2563eb', // blue-600
        '#ea580c', // orange-600
        '#d97706', // amber-600
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
