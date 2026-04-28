export function getTagStyle(tag: string): { color: string; bg: string; border: string } {
    // Deterministic unique HSL color from tag name
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Spread hues evenly, keep saturation/lightness readable
    let hue = Math.abs(hash) % 360;
    // Avoid yellow/amber/orange (20-75) to keep it for selection
    if (hue >= 20 && hue <= 75) {
        hue = hue < 47 ? 15 : 85; 
    }
    
    const sat = 65 + (Math.abs(hash >> 8) % 15); // 65-80%
    const lit = 55 + (Math.abs(hash >> 16) % 10); // 55-65%
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    const bg = `hsla(${hue}, ${sat}%, ${lit}%, 0.12)`;
    const border = `hsl(${hue}, ${sat}%, ${lit}%)`;
    return { color, bg, border };
}
