export const STORY_COLORS = [
    'text-red-600 dark:text-red-400', 'text-orange-600 dark:text-orange-400', 'text-amber-600 dark:text-amber-400',
    'text-yellow-600 dark:text-yellow-400', 'text-lime-600 dark:text-lime-400', 'text-green-600 dark:text-green-400',
    'text-emerald-600 dark:text-emerald-400', 'text-teal-600 dark:text-teal-400', 'text-cyan-600 dark:text-cyan-400',
    'text-sky-600 dark:text-sky-400', 'text-blue-600 dark:text-blue-400', 'text-indigo-600 dark:text-indigo-400',
    'text-violet-600 dark:text-violet-400', 'text-purple-600 dark:text-purple-400', 'text-fuchsia-600 dark:text-fuchsia-400',
    'text-pink-600 dark:text-pink-400', 'text-rose-600 dark:text-rose-400'
];

export function getStoryColor(id: number): string {
    return STORY_COLORS[id % STORY_COLORS.length];
}
