import { useEffect, useState } from 'react';
import { Users, MousePointerClick, FileText, MessageSquare, Search, X } from 'lucide-react';
import { AdminHeader } from './AdminHeader';

interface AdminDashboardProps {
    onClose?: () => void;
}

interface AppStats {
    total_users: number;
    total_interactions: number;
    total_stories: number;
    total_comments: number;
}

interface User {
    id: string;
    email: string;
    name: string;
    avatar_url: string;
    is_admin: boolean;
    total_views: number;
    last_seen: string | null;
    created_at: string;
}

export function AdminDashboard({ onClose }: AdminDashboardProps) {
    const [stats, setStats] = useState<AppStats | null>(null);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'dashboard' | 'users'>('dashboard');
    const [userSearch, setUserSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_URL || '';
        try {
            const [statsRes, usersRes] = await Promise.all([
                fetch(`${baseUrl}/api/admin/stats`, { credentials: 'include' }),
                fetch(`${baseUrl}/api/admin/users`, { credentials: 'include' })
            ]);

            if (!statsRes.ok || !usersRes.ok) {
                if (statsRes.status === 401 || statsRes.status === 403) throw new Error('Access denied.');
                throw new Error('Failed to fetch data');
            }

            const statsData = await statsRes.json();
            const usersData = await usersRes.json();

            setStats(statsData);
            setUsers(usersData);
            setLoading(false);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
    );

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 md:p-12">
                <div className="flex h-full w-full max-w-7xl flex-col bg-[#0b0c10] rounded-xl shadow-2xl overflow-hidden relative border border-slate-700/50">
                    <AdminHeader onClose={onClose} />
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 md:p-12">
                <div className="flex h-full w-full max-w-7xl flex-col bg-[#0b0c10] rounded-xl shadow-2xl overflow-hidden relative border border-slate-700/50">
                    {onClose && (
                        <button onClick={onClose} className="absolute top-4 right-4 z-50 p-2 text-slate-400 hover:text-white bg-[#0b0c10]/50 hover:bg-[#181b1f] rounded-full transition-all">
                            <X size={20} />
                        </button>
                    )}
                    <AdminHeader onClose={onClose} />
                    <div className="flex-1 flex items-center justify-center p-6">
                        <div className="bg-[#181b1f] border border-red-900/50 p-6 rounded-lg max-w-md text-center">
                            <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Dashboard</h2>
                            <p className="text-gray-400 mb-4">{error}</p>
                            <button onClick={fetchData} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors">Retry</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 md:p-12">
            <div className="flex flex-col w-full max-w-7xl bg-[#0b0c10] h-full max-h-[90vh] rounded-xl shadow-2xl overflow-hidden relative border border-slate-700/50 animate-in fade-in zoom-in-95 duration-200">

                {onClose && (
                    <button onClick={onClose} className="absolute top-5 right-6 z-50 p-1.5 text-slate-400 hover:text-white bg-[#0b0c10]/50 hover:bg-[#181b1f] rounded-full transition-all">
                        <X size={20} />
                    </button>
                )}

                <AdminHeader onClose={onClose} />

                <main className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-8">

                        {/* KPI Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                title="Total Users"
                                value={stats?.total_users || 0}
                                icon={Users}
                                color="text-blue-400"
                                onClick={() => setView('users')}
                                active={view === 'users'}
                            />
                            <StatCard
                                title="App Views"
                                subtitle="Unique Interactions"
                                value={stats?.total_interactions || 0}
                                icon={MousePointerClick}
                                color="text-emerald-400"
                            />
                            <StatCard
                                title="Stories Indexed"
                                value={stats?.total_stories || 0}
                                icon={FileText}
                                color="text-amber-400"
                            />
                            <StatCard
                                title="Comments Indexed"
                                value={stats?.total_comments || 0}
                                icon={MessageSquare}
                                color="text-purple-400"
                            />
                        </div>

                        {/* Users Section */}
                        {view === 'users' && (
                            <div className="bg-[#181b1f] border border-[#2c323b] rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                                <div className="p-4 border-b border-[#2c323b] flex items-center justify-between bg-[#1f2228]">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <Users size={18} className="text-blue-400" />
                                        Registered Users
                                        <span className="bg-[#2c323b] text-xs px-2 py-0.5 rounded-full text-gray-400">{users.length}</span>
                                    </h3>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search users..."
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            className="bg-[#0b0c10] border border-[#2c323b] rounded-md pl-9 pr-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 placeholder-gray-600 w-64 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-[#131519] text-gray-500 uppercase font-medium tracking-wider">
                                            <tr>
                                                <th className="px-6 py-3">User</th>
                                                <th className="px-6 py-3">Email</th>
                                                <th className="px-6 py-3">Role</th>
                                                <th className="px-6 py-3">Stats</th>
                                                <th className="px-6 py-3">Joined</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#2c323b]">
                                            {filteredUsers.map(user => (
                                                <tr key={user.id} className="hover:bg-[#1f2228] transition-colors group">
                                                    <td className="px-6 py-3 whitespace-nowrap">
                                                        <div className="flex items-center gap-3">
                                                            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full bg-[#2c323b]" />
                                                            <span className="font-medium text-gray-200 group-hover:text-blue-400 transition-colors">{user.name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap text-gray-400 font-mono text-xs">{user.email}</td>
                                                    <td className="px-6 py-3 whitespace-nowrap">
                                                        {user.is_admin ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">Admin</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700/30 text-slate-400 border border-slate-600/30">User</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <div className="text-sm text-gray-300 font-medium">{user.total_views} views</div>
                                                            <div className="text-xs text-gray-500">
                                                                {user.last_seen ? (
                                                                    <>Last seen {new Date(user.last_seen).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                                                                ) : (
                                                                    <>Never active</>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 whitespace-nowrap text-gray-500 text-xs">
                                                        {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredUsers.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                                        No users found matching "{userSearch}"
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}

function StatCard({ title, subtitle, value, icon: Icon, color, onClick, active }: { title: string; subtitle?: string; value: number; icon: any; color: string; onClick?: () => void; active?: boolean }) {
    return (
        <div
            onClick={onClick}
            className={`bg-[#181b1f] border border-[#2c323b] rounded-lg p-5 flex flex-col justify-between h-32 relative overflow-hidden group transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-blue-500/40 hover:bg-[#1f2228]' : ''} ${active ? 'ring-1 ring-blue-500 border-blue-500/50 bg-[#1f2228]' : ''}`}
        >
            <div className="flex justify-between items-start z-10">
                <div>
                    <h3 className="text-gray-400 text-sm font-medium uppercase tracking-wider">{title}</h3>
                    {subtitle && <p className="text-gray-600 text-xs mt-0.5">{subtitle}</p>}
                </div>
                <Icon size={20} className={`${color} opacity-80`} />
            </div>

            <div className="mt-auto z-10">
                <span className="text-3xl font-bold text-white tracking-tight">{value.toLocaleString()}</span>
            </div>

            {/* Subtle glow effect */}
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full ${color.replace('text-', 'bg-')}/5 blur-2xl group-hover:blur-3xl transition-all duration-500`}></div>
        </div>
    );
}
