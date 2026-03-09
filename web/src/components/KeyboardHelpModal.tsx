import { X } from 'lucide-react';

interface KeyboardHelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function KeyboardHelpModal({ isOpen, onClose }: KeyboardHelpModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded font-mono text-sm border border-slate-200 dark:border-slate-700">⌘</kbd>
                        Keyboard Shortcuts
                    </h2>
                    <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto max-h-[70vh]">
                    <div className="space-y-6">
                        {/* Feed Navigation */}
                        <section>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 ml-1">Feed Navigation</h3>
                            <div className="space-y-2">
                                <ShortcutRow keys={['↑', '↓']} action="Navigate up/down in the feed" />
                                <ShortcutRow keys={['Enter']} action="Open the selected story in Split View" />
                                <ShortcutRow keys={['/']} action="Focus the search/filter box" />
                            </div>
                        </section>

                        {/* Tab & View Management */}
                        <section>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 ml-1">Tab & View Management</h3>
                            <div className="space-y-2">
                                <ShortcutRow keys={['Ctrl', 'Tab']} action="Cycle through open tabs and the feed" />
                                <ShortcutRow keys={['Ctrl', 'Alt', '→']} action="Switch to Discussion View" />
                                <ShortcutRow keys={['Ctrl', 'Alt', '←']} action="Switch to Article View" />
                                <ShortcutRow keys={['Ctrl', 'Space']} action="Cycle Article → Disc → Split" />
                            </div>
                        </section>

                        {/* Reader & Discussion View */}
                        <section>
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 ml-1">Inside Discussions</h3>
                            <div className="space-y-2">
                                <ShortcutRow keys={['j', 'k']} action="Navigate comments up/down" />
                                <ShortcutRow keys={['c', '←']} action="Collapse the active comment thread" />
                                <ShortcutRow keys={['→']} action="Expand a collapsed comment thread" />
                                <ShortcutRow keys={['s']} action="Generate AI summary of the active comment" />
                            </div>
                        </section>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-xs text-center text-slate-500 font-medium">
                    Press <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">Escape</kbd> to close this dialog.
                </div>
            </div>
        </div>
    );
}

function ShortcutRow({ keys, action }: { keys: string[], action: string }) {
    return (
        <div className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors group">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                {action}
            </span>
            <div className="flex items-center gap-1.5">
                {keys.map((k, i) => (
                    <kbd key={i} className="min-w-[24px] text-center px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs font-bold border border-slate-200 dark:border-slate-600 shadow-sm rounded-md">
                        {k}
                    </kbd>
                ))}
            </div>
        </div>
    );
}
