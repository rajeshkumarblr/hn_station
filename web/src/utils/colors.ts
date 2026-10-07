
/**
 * Returns a deterministic, high-contrast color for topic tags,
 * with dedicated signature colors for core technical topics.
 */
export function getTagStyle(tag: string): { color: string; bg: string; border: string } {
    const key = tag.trim().toLowerCase();

    const NAMED_COLORS: Record<string, string> = {
        postgres: '#38bdf8',    // sky-400 (PostgreSQL blue)
        postgresql: '#38bdf8',  // sky-400
        database: '#2dd4bf',    // teal-400
        databases: '#2dd4bf',
        llm: '#a78bfa',         // violet-400
        ai: '#34d399',          // emerald-400
        model: '#f472b6',       // pink-400
        go: '#22d3ee',          // cyan-400
        golang: '#22d3ee',
        rust: '#fb923c',        // orange-400
        security: '#fb7185',    // rose-400
        linux: '#facc15',       // yellow-400
    };

    const COLORS = [
        '#818cf8', // indigo-400
        '#38bdf8', // sky-400
        '#34d399', // emerald-400
        '#a78bfa', // violet-400
        '#fb7185', // rose-400
        '#2dd4bf', // teal-400
        '#f472b6', // pink-400
        '#60a5fa', // blue-400
        '#fb923c', // orange-400
        '#c084fc', // purple-400
    ];

    let color = NAMED_COLORS[key];
    if (!color) {
        let hash = 0;
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % COLORS.length;
        color = COLORS[index];
    }

    return {
        color: color,
        bg: `${color}24`,     // ~14% opacity hex for richer badge fill
        border: `${color}66`, // ~40% opacity hex for crisp badge border
    };
}

/**
 * Returns a neutral, "hint" style for topics that haven't been promoted to filters.
 */
export function getNeutralTagStyle(): { color: string; bg: string; border: string } {
    return {
        color: '#cbd5e1', // slate-300
        bg: '#1e293b80',
        border: '#47556980'
    };
}
