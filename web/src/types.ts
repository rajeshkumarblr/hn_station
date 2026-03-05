export interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string;
    created_at: string;
    hn_rank?: number;
    is_read?: boolean;
    is_saved?: boolean;
    is_hidden?: boolean;
    summary?: string;
    topics?: string[];
}

export interface ReaderTab {
    id: string;
    storyId: number;
    story: Story;
    mode: 'article' | 'discussion' | 'split';
}

export const MODES = [
    { key: 'default', label: 'Top' },
    { key: 'latest', label: 'New' },
    { key: 'votes', label: 'Best' },
    { key: 'show', label: 'Show HN' },
    { key: 'saved', label: 'Bookmarks' },
] as const;

export type ModeKey = typeof MODES[number]['key'];

export const PAGE_SIZE = 10;
export const MAX_READ_IDS = 500;
