import React, { useState, useEffect } from 'react';
import { getApiBase } from '../utils/apiBase';
import { isWebPreview } from '../utils/env';
import { X, Save, Key, ExternalLink, Monitor, Cpu, Keyboard, Moon, Sun, Layout, MessageSquare, Split, Zap } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
}

type TabType = 'ai' | 'ui' | 'keyboard';

export function SettingsModal({ isOpen, onClose, user }: SettingsModalProps) {
    const isWebMode = isWebPreview();
    const [activeTab, setActiveTab] = useState<TabType>(isWebMode ? 'ui' : 'ai');
    const [apiKey, setApiKey] = useState('');
    const [aiEnabled, setAiEnabled] = useState(false);
    const [ollamaModel, setOllamaModel] = useState('');
    const [aiProvider, setAiProvider] = useState<'local' | 'gemini' | 'both'>('local');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Context from window or props for theme and reader mode
    // Note: In a real app we'd use useAppState, but we are keeping this somewhat self-contained
    // for now as it's triggered from DesktopLayout.
    const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    const [theme, setTheme] = useState<'dark' | 'light'>(currentTheme);

    useEffect(() => {
        if (isOpen && user) {
            setApiKey(user.gemini_api_key || '');
            setAiEnabled(user.ai_summaries_enabled || false);
            setOllamaModel(user.ollama_model || '');
            setAiProvider(user.ai_provider || 'local');
        }
    }, [isOpen, user]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const baseUrl = getApiBase();
            const res = await fetch(`${baseUrl}/api/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                    gemini_api_key: apiKey,
                    ai_summaries_enabled: aiEnabled,
                    ollama_model: ollamaModel,
                    ai_provider: aiProvider
                }),
            });

            if (!res.ok) throw new Error('Failed to update settings');

            // Apply theme change locally
            if (theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }

            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onClose();
                window.location.reload();
            }, 1000);
        } catch (err) {
            setError('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Monitor size={18} className="text-blue-500" />
                        Application Settings
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-48 border-r border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/20 p-2 shrink-0">
                        {!isWebMode && (
                            <button
                                onClick={() => setActiveTab('ai')}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all mb-1 ${activeTab === 'ai' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                            >
                                <Cpu size={16} /> AI Settings
                            </button>
                        )}
                        <button
                            onClick={() => setActiveTab('ui')}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all mb-1 ${activeTab === 'ui' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                        >
                            <Sun size={16} /> UI Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('keyboard')}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === 'keyboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'}`}
                        >
                            <Keyboard size={16} /> Keyboard
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <form id="settings-form" onSubmit={handleSave} className="space-y-8">
                            {activeTab === 'ai' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">AI Intelligence</h3>
                                        <p className="text-xs text-slate-500">Configure how HN Station summarizes and analyzes content.</p>
                                    </div>

                                    {/* Provider Selection */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">AI Provider</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { id: 'local', label: 'Local Only', desc: 'Ollama only' },
                                                { id: 'gemini', label: 'Cloud Only', desc: 'Gemini API' },
                                                { id: 'both', label: 'Hybrid', desc: 'Local w/ Fallback' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() => setAiProvider(opt.id as any)}
                                                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all text-center ${aiProvider === opt.id ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/10' : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}
                                                >
                                                    <span className={`text-[11px] font-bold ${aiProvider === opt.id ? 'text-orange-600' : 'text-slate-500'}`}>{opt.label}</span>
                                                    <span className="text-[9px] text-slate-400 mt-0.5">{opt.desc}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Local AI Details */}
                                    {(aiProvider === 'local' || aiProvider === 'both') && (
                                        <div className="space-y-4 p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                        Ollama Integration
                                                        <div className={`w-1.5 h-1.5 rounded-full ${user?.ollama_available ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                                    </h4>
                                                    <p className="text-[11px] text-slate-500">{user?.ollama_available ? 'Connected and ready' : 'Not detected on localhost:11434'}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAiEnabled(!aiEnabled)}
                                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${aiEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                                                >
                                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${aiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                                </button>
                                            </div>

                                            {aiEnabled && user?.ollama_available && (
                                                <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Model</label>
                                                    <select
                                                        value={ollamaModel}
                                                        onChange={(e) => setOllamaModel(e.target.value)}
                                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl py-2 px-4 text-xs dark:text-slate-100 outline-none focus:ring-2 focus:ring-orange-500/20"
                                                    >
                                                        <option value="">Default (Auto-detect)</option>
                                                        {user?.ollama_models?.map((m: string) => (
                                                            <option key={m} value={m}>{m}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Gemini API Key */}
                                    {(aiProvider === 'gemini' || aiProvider === 'both') && (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Gemini API Key</label>
                                                <div className="relative">
                                                    <input
                                                        type="password"
                                                        value={apiKey}
                                                        onChange={(e) => setApiKey(e.target.value)}
                                                        placeholder="AIzaSy..."
                                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl outline-none text-sm dark:text-slate-100"
                                                    />
                                                    <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                </div>
                                                <p className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    Used for fallback and chat. <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 hover:underline">Get Key <ExternalLink size={8} /></a>
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'ui' && (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Visual Settings</h3>
                                        <p className="text-xs text-slate-500">Customize the look and feel of the application.</p>
                                    </div>

                                    {/* Theme Switcher */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Appearance</label>
                                        <div className="flex gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setTheme('light')}
                                                className={`flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'light' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-500/10' : 'border-slate-100 dark:border-slate-800'}`}
                                            >
                                                <Sun size={18} className={theme === 'light' ? 'text-blue-500' : 'text-slate-400'} />
                                                <span className={`text-sm font-bold ${theme === 'light' ? 'text-blue-600' : 'text-slate-500'}`}>Light</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTheme('dark')}
                                                className={`flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all ${theme === 'dark' ? 'border-orange-500 bg-orange-50/50 dark:bg-orange-500/10' : 'border-slate-100 dark:border-slate-800'}`}
                                            >
                                                <Moon size={18} className={theme === 'dark' ? 'text-orange-500' : 'text-slate-400'} />
                                                <span className={`text-sm font-bold ${theme === 'dark' ? 'text-orange-600' : 'text-slate-500'}`}>Dark</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Default View - Hidden in Web Preview */}
                                    {!isWebMode && (
                                        <div className="space-y-3">
                                            <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">Default Reader View</label>
                                            <div className="grid grid-cols-3 gap-3">
                                                {[
                                                    { id: 'article', label: 'Article Only', icon: Layout },
                                                    { id: 'discussion', label: 'Comments Only', icon: MessageSquare },
                                                    { id: 'split', label: 'Split View', icon: Split }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        disabled // Not fully implemented yet in state but we show UI
                                                        className="flex flex-col items-center p-3 rounded-xl border-2 border-slate-100 dark:border-slate-800 opacity-40 cursor-not-allowed"
                                                    >
                                                        <opt.icon size={16} className="text-slate-400 mb-1" />
                                                        <span className="text-[11px] font-bold text-slate-500">{opt.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-slate-400">View mode persistence coming soon.</p>
                                        </div>
                                    )}

                                    {isWebMode && (
                                        <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                                            <div className="flex items-start gap-3">
                                                <Zap size={16} className="text-blue-500 shrink-0 mt-0.5" />
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">Desktop Features</h4>
                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                                        AI Summaries, Multi-Tab workspace, and Split View are available exclusively in the Desktop application.
                                                    </p>
                                                    <a href="/api/download/latest" className="inline-block mt-3 text-[10px] font-bold text-blue-600 hover:underline">
                                                        Learn more & Download →
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'keyboard' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-1">
                                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Keyboard Shortcuts</h3>
                                        <p className="text-xs text-slate-500">Control the entire app without a mouse.</p>
                                    </div>

                                    <div className="space-y-2">
                                        {[
                                            { cmd: 'J / K', desc: 'Next / Previous story' },
                                            { cmd: 'Enter', desc: 'Open in split view' },
                                            { cmd: 'Space', desc: 'Open in article only' },
                                            { cmd: 'L (Hold)', desc: 'Mark as read (Long press)' },
                                            { cmd: 'S', desc: 'Toggle save / bookmark' },
                                            { cmd: 'H', desc: 'Hide story' },
                                            { cmd: '/', desc: 'Focus topic search' },
                                            { cmd: 'N / P', desc: 'Next / Prev Pagination' },
                                            { cmd: 'Esc', desc: 'Back to feed / Close Reader' },
                                            { cmd: 'Shift + G', desc: 'Open Settings' }
                                        ].map(sh => (
                                            <div key={sh.cmd} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{sh.desc}</span>
                                                <kbd className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 uppercase">{sh.cmd}</kbd>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </form>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
                    <div className="flex-1">
                        {error && <span className="text-[11px] font-bold text-red-500">{error}</span>}
                        {success && <span className="text-[11px] font-bold text-green-500">Settings saved successfully!</span>}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            form="settings-form"
                            type="submit"
                            disabled={saving}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black shadow-lg shadow-orange-500/10 transition-all ${success ? 'bg-green-600 text-white' : 'bg-[#ff6600] hover:bg-[#e65c00] text-white disabled:opacity-50'}`}
                        >
                            {success ? 'Success!' : (
                                <>
                                    <Save size={14} />
                                    SAVE SETTINGS
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
