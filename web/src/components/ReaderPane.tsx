import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'github-markdown-css/github-markdown-dark.css';
import { MessageSquare, FileText, BookOpen, RefreshCw, ExternalLink } from 'lucide-react';
import { CommentList } from './CommentList';

interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: string;
}

interface ReaderPaneProps {
    story: Story;
    comments: any[];
    commentsLoading: boolean;
}

function isGitHubURL(url: string): boolean {
    try {
        const u = new URL(url);
        return u.hostname === 'github.com' || u.hostname === 'www.github.com';
    } catch {
        return false;
    }
}

export function ReaderPane({ story, comments, commentsLoading }: ReaderPaneProps) {
    const isGH = story.url ? isGitHubURL(story.url) : false;
    const isShowHN = story.title.startsWith('Show HN');

    // Default tab: readme for Show HN + GitHub, otherwise discussion
    const defaultTab = (isShowHN && isGH) ? 'readme' : 'discussion';
    const [activeTab, setActiveTab] = useState<'discussion' | 'readme' | 'article'>(defaultTab);

    // Readme content
    const [readme, setReadme] = useState<string>('');
    const [readmeLoading, setReadmeLoading] = useState(false);
    const [readmeError, setReadmeError] = useState<string | null>(null);

    // Reset tab when story changes
    useEffect(() => {
        const isStoryGH = story.url ? isGitHubURL(story.url) : false;
        const isStoryShowHN = story.title.startsWith('Show HN');
        setActiveTab((isStoryShowHN && isStoryGH) ? 'readme' : 'discussion');
        setReadme('');
        setReadmeError(null);
    }, [story.id]);

    // Fetch README when tab switches to readme
    useEffect(() => {
        if (activeTab !== 'readme' || !isGH || !story.url) return;
        if (readme) return; // already fetched

        setReadmeLoading(true);
        setReadmeError(null);
        const baseUrl = import.meta.env.VITE_API_URL || '';
        fetch(`${baseUrl}/api/content/readme?url=${encodeURIComponent(story.url)}`)
            .then(res => {
                if (!res.ok) throw new Error('README not found');
                return res.text();
            })
            .then(text => {
                setReadme(text);
                setReadmeLoading(false);
            })
            .catch(err => {
                setReadmeError(err.message);
                setReadmeLoading(false);
            });
    }, [activeTab, story.url, isGH, readme]);

    const tabClass = (tab: string) =>
        `flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
            ? 'border-blue-500 text-blue-400'
            : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-600'
        }`;

    const disabledTabClass = `flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 border-transparent text-slate-600 cursor-not-allowed`;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-[#0d1117]/95 backdrop-blur border-b border-slate-800 px-6 pt-5 pb-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                    <h1 className="text-xl font-bold text-slate-100 leading-snug">
                        {story.title}
                    </h1>
                    <a
                        href={story.url || `https://news.ycombinator.com/item?id=${story.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-lg bg-slate-800 text-blue-400 hover:bg-blue-900/30 transition-colors shrink-0"
                        title="Open Link"
                    >
                        <ExternalLink size={20} />
                    </a>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                    <span>{story.score} points</span>
                    <span>by <span className="text-slate-300 font-medium">{story.by}</span></span>
                    <span>{new Date(story.time).toLocaleDateString()}</span>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-0">
                    <button onClick={() => setActiveTab('discussion')} className={tabClass('discussion')}>
                        <MessageSquare size={14} />
                        Discussion
                        {story.descendants > 0 && (
                            <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded-full">
                                {story.descendants}
                            </span>
                        )}
                    </button>

                    {isGH ? (
                        <button onClick={() => setActiveTab('readme')} className={tabClass('readme')}>
                            <BookOpen size={14} />
                            Readme
                        </button>
                    ) : (
                        <span className={disabledTabClass} title="Only available for GitHub URLs">
                            <BookOpen size={14} />
                            Readme
                        </span>
                    )}

                    <button onClick={() => setActiveTab('article')} className={tabClass('article')}>
                        <FileText size={14} />
                        Article
                    </button>
                </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
                {activeTab === 'discussion' && (
                    <div className="p-6 pt-4">
                        {commentsLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                                <RefreshCw size={24} className="animate-spin" />
                                <span>Loading discussion...</span>
                            </div>
                        ) : comments.length > 0 ? (
                            <CommentList comments={comments} parentId={null} />
                        ) : (
                            <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                                <MessageSquare size={32} className="mx-auto text-slate-600 mb-2" />
                                <p className="text-slate-400">No comments yet.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'readme' && (
                    <div className="p-6 pt-4">
                        {readmeLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                                <RefreshCw size={24} className="animate-spin" />
                                <span>Loading README...</span>
                            </div>
                        ) : readmeError ? (
                            <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                                <BookOpen size={32} className="mx-auto text-slate-600 mb-2" />
                                <p className="text-slate-400">{readmeError}</p>
                            </div>
                        ) : (
                            <div className="markdown-body" style={{ backgroundColor: 'transparent' }}>
                                <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
                                    {readme}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'article' && (
                    story.url ? (
                        <iframe
                            key={story.id}
                            src={story.url}
                            title={story.title}
                            className="w-full h-full border-0 bg-white"
                            sandbox="allow-scripts allow-same-origin allow-popups"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center">
                            <FileText size={32} className="mb-3 opacity-50" />
                            <p className="font-medium">No external link</p>
                            <p className="text-sm mt-1">This is a text post — check the Discussion tab.</p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
