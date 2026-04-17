export interface User {
    id: string;
    email: string;
    name: string;
    topics: string[];
    iframe_blocked: boolean | null;
    avatar_url: string;
    is_admin: boolean;
    authenticated: boolean;
    ai_summaries_enabled: boolean;
    ollama_available: boolean;
    ollama_model?: string;
    ollama_models?: string[];
    gemini_api_key?: string;
    total_views?: number;
    last_seen?: string | null;
    created_at?: string;
}

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
    iframe_blocked?: boolean;
    gemini_url?: string;
}

export interface ReaderTab {
    id: string;
    storyId: number;
    story: Story;
    mode: 'article' | 'discussion' | 'split';
    parentTabId?: string;
    isAISidebarOpen?: boolean;
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

export interface ChatMessage {
    id: number;
    user_id: string;
    story_id: number;
    role: 'user' | 'model' | 'assistant';
    content: string;
    created_at: string;
}
