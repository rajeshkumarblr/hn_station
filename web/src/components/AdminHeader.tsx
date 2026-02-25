import { Link } from 'react-router-dom';
import { Shield, ArrowLeft, LogOut } from 'lucide-react';

interface AdminHeaderProps {
    onClose?: () => void;
}

export function AdminHeader({ onClose }: AdminHeaderProps) {
    return (
        <header className="bg-[#1a2332] border-b border-slate-700 px-6 flex-shrink-0 z-50 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
                {onClose ? (
                    <button onClick={onClose} className="p-2 -ml-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Close Admin Dashboard">
                        <ArrowLeft size={20} />
                    </button>
                ) : (
                    <Link to="/" className="p-2 -ml-2 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors" title="Back to App">
                        <ArrowLeft size={20} />
                    </Link>
                )}
                <div className="flex items-center gap-2">
                    <Shield className="text-orange-500" size={24} />
                    <span className="font-bold text-lg tracking-tight text-white">HN Station <span className="text-xs text-slate-500 font-normal uppercase tracking-wider ml-2">Admin</span></span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="text-xs text-slate-500 font-mono">v2.17</div>
                <div className="h-6 w-px bg-slate-700"></div>
                <a
                    href="/auth/logout"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold transition-all"
                    title="Sign out"
                >
                    <LogOut size={14} />
                    Logout
                </a>
            </div>
        </header>
    );
}
