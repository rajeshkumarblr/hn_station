import { useState, useEffect } from 'react';
import { getApiBase, subscribeApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import { isWebPreview } from '../utils/env';

interface Status {
    next_refresh_at: string;
    last_refresh_at: string;
    is_refreshing: boolean;
    auto_summarize_queue: number;
    ai_status: string;
    current_task?: string;
}

/**
 * Quiet inline activity indicator for the top header.
 * Stays completely invisible when idle; only shows subtle text while refreshing or summarizing.
 */
export function HeaderSyncStatus() {
    const [status, setStatus] = useState<Status | null>(null);
    const [baseUrl, setBaseUrl] = useState(getApiBase());
    const isWeb = isWebPreview();

    useEffect(() => {
        return subscribeApiBase(url => {
            setBaseUrl(url);
        });
    }, []);

    useEffect(() => {
        if (!baseUrl || isWeb) return;

        const fetchStatus = async () => {
            try {
                const res = await fetchWithAuth(`${baseUrl}/api/status`);
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                }
            } catch {
                // Silent when local backend is starting
            }
        };

        fetchStatus();
        const interval = setInterval(() => {
            if (!document.hidden) fetchStatus();
        }, 12000);
        return () => clearInterval(interval);
    }, [baseUrl, isWeb]);

    if (isWeb || !status) return null;

    if (status.is_refreshing) {
        return (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-zinc-400 mr-1.5 select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e06834] animate-pulse" />
                <span>Refreshing…</span>
            </span>
        );
    }

    if (status.ai_status === 'Busy') {
        return (
            <span
                className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-zinc-400 mr-1.5 max-w-[180px] select-none"
                title={status.current_task ? `Summarizing: ${status.current_task}` : 'Generating local summary'}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-stone-400 dark:bg-zinc-500 animate-pulse shrink-0" />
                <span className="truncate">
                    Summarizing{status.auto_summarize_queue > 0 ? ` (${status.auto_summarize_queue})` : '…'}
                </span>
            </span>
        );
    }

    return null;
}

export function StatusBar() {
    return null;
}
