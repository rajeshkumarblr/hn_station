import { useState, useEffect } from 'react';
import { getApiBase } from '../utils/apiBase';
import { fetchWithAuth } from '../utils/api';
import { Clock, Zap, Loader2, CheckCircle2 } from 'lucide-react';

interface Status {
    next_refresh_at: string;
    last_refresh_at: string;
    is_refreshing: boolean;
    auto_summarize_queue: number;
    ai_status: string;
    current_task?: string;
}

export function StatusBar() {
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState(false);
    const [retries, setRetries] = useState(0);

    useEffect(() => {
        const fetchStatus = async () => {
            const baseUrl = getApiBase();
            if (!baseUrl) return; // Wait for base URL

            try {
                const res = await fetchWithAuth(`${baseUrl}/api/status`);
                if (res.ok) {
                    const data = await res.json();
                    setStatus(data);
                    setError(false);
                    setRetries(0);
                } else {
                    setRetries(prev => prev + 1);
                    if (retries >= 2) setError(true);
                }
            } catch (e) {
                setRetries(prev => prev + 1);
                if (retries >= 2) setError(true);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, [retries]);

    if (error) {
        return (
            <div className="h-7 bg-slate-50 dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between text-[10px] font-bold uppercase">
                <div className="flex items-center gap-2 text-slate-400">
                    <CheckCircle2 size={11} className="text-indigo-500" />
                    Web Preview Mode
                </div>
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400/80">
                    <span>HN Station</span>
                </div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="h-7 bg-slate-50 dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-800 px-4 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                <Loader2 size={11} className="animate-spin" />
                Connecting...
            </div>
        );
    }

    const nextRefresh = new Date(status.next_refresh_at);
    const now = new Date();
    const diffMs = nextRefresh.getTime() - now.getTime();
    const diffMins = Math.max(0, Math.ceil(diffMs / 60000));

    return (
        <div className="h-7 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 px-6 flex items-center justify-between text-[9px] font-black tracking-[0.1em] uppercase select-none">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Clock size={12} className={status.is_refreshing ? "animate-spin text-indigo-500" : ""} />
                    {status.is_refreshing ? (
                        <span className="text-indigo-500">Refreshing Feed...</span>
                    ) : (
                        <span>Next Refresh: <span className="text-slate-900 dark:text-slate-100">{diffMins}m</span></span>
                    )}
                </div>

                <div className="w-px h-3 bg-slate-200 dark:bg-slate-800" />

                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Zap size={12} className={status.ai_status === 'Busy' ? "text-orange-500 animate-pulse" : "text-indigo-500"} />
                    AI Insights: 
                    <span className={
                        status.ai_status === 'Rate-Limited' ? "text-amber-500 font-bold" : 
                        status.ai_status === 'Busy' ? "text-orange-500" : "text-indigo-500"
                    }>
                        {status.ai_status === 'Busy' ? `Analyzing: ${status.current_task || 'Story'}` : status.ai_status}
                    </span>
                    {status.auto_summarize_queue > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold">
                            {status.auto_summarize_queue} queued
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400/80">
                <CheckCircle2 size={12} />
                <span>Station Engine v1.0.0-RC40</span>
            </div>
        </div>
    );
}

