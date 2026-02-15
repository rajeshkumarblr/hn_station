import React, { useState, useEffect } from 'react';
import { X, Save, Key, ExternalLink } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

export function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load existing key (not possible mostly as we don't return it for security, 
    // but if we did, we'd fetch it here. For now, it's write-only or we assume blank on load)
    // The backend store update returns empty string for key in GetAuthUser as per my change? 
    // Wait, I updated GetAuthUser to return the key.
    // So we should pre-fill it if we want, or just leave blank for security.
    // The Prompt said: "Get your key at ... Your key is stored locally/in your private DB instance."
    // If I return it, I should pre-fill it.

    useEffect(() => {
        if (isOpen && user?.gemini_api_key) {
            // If the user object in App.tsx is updated with the key, use it.
            // But App.tsx fetches /api/me which I updated to return the key.
            // So yes, pre-fill.
            setApiKey(user.gemini_api_key || '');
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const baseUrl = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${baseUrl}/api/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ gemini_api_key: apiKey }),
            });

            if (!res.ok) throw new Error('Failed to update settings');

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onClose();
                // Trigger a reload of user profile in parent would be ideal, but for now just close
                // Actually, better to reload the page or trigger parent callback to refresh user
                window.location.reload();
            }, 1000);
        } catch (err) {
            setError('Failed to save API Key');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Key size={18} className="text-orange-500" />
                        Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSave} className="p-6 space-y-4">

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Google Gemini API Key
                        </label>
                        <div className="relative">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIzaSy..."
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400"
                            />
                            <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-4">
                            <span>Required for summaries.</span>
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                            >
                                Get your free key <ExternalLink size={10} />
                            </a>
                        </p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-xs p-3 rounded-lg border border-blue-100 dark:border-blue-800/50">
                        <strong>Note:</strong> Your API key is stored in your own database instance. It is required to use the "Summarize" feature.
                    </div>

                    {error && (
                        <div className="text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-900/50">
                            {error}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="pt-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition-all
                ${success
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-orange-500 hover:bg-orange-600 disabled:opacity-70 disabled:cursor-not-allowed'
                                }`}
                        >
                            {success ? 'Saved!' : (
                                <>
                                    <Save size={16} />
                                    Save Key
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
