
import { Home, Bookmark, Settings, ArrowLeft, RefreshCw, Sun, Moon } from 'lucide-react';
import { StoryCard, getTagStyle } from '../components/StoryCard';
import { ReaderPane } from '../components/ReaderPane';
import { getStoryTopicMatch } from '../hooks/useAppState';
import { MODES } from '../types';

export function MobileLayout({ app }: { app: ReturnType<typeof import('../hooks/useAppState').useAppState> }) {
    const {
        loading, error, mode, activeTopics, hasMore, theme,
        readingQueue, user, hiddenStories, offset, setOffset,
        selectedStory, readerTab, stories, availableTags,
        setMode, setActiveTopics,
        setCurrentView, toggleTheme, handleHideStory,
        handleToggleQueue, handleToggleSave,
        handleStoryInteractWithQueue, readIds, currentView
    } = app;

    return (
        <div className="h-[100dvh] w-full bg-[#f3f4f6] dark:bg-[#0f172a] text-gray-800 dark:text-slate-200 font-sans flex flex-col overflow-hidden transition-colors duration-200">

            {/* ─── Top Bar: Contextual ─── */}
            <header className="bg-[#1a2332] border-b border-slate-700 px-4 flex-shrink-0 z-50 h-[60px] flex items-center justify-between">
                {currentView === 'reader' && selectedStory ? (
                    <div className="flex items-center gap-3 w-full">
                        <button
                            onClick={() => setCurrentView('feed')}
                            className="p-2 -ml-2 rounded-full hover:bg-slate-800 text-slate-300"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 truncate">
                            {/* Domain Favicon / Icon */}
                            <div className="flex items-center gap-2">
                                {(() => {
                                    if (selectedStory.url) {
                                        try {
                                            const domain = new URL(selectedStory.url).hostname.replace(/^www\./, '');
                                            return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" className="w-4 h-4 rounded-sm" />;
                                        } catch { }
                                    }
                                    return <span>{readerTab === 'article' ? '📄' : '💬'}</span>;
                                })()}
                                <span className="text-sm font-semibold text-white truncate">{selectedStory.title}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-orange-600">HN</h1>
                            {loading && <RefreshCw size={14} className="animate-spin text-orange-500" />}
                        </div>

                        {/* Quick Topic Filter Chips (Horizontal Scroll) */}
                        <div className="flex-1 overflow-x-auto hide-scrollbar flex items-center gap-2 px-3 mask-edges">
                            {availableTags.slice(0, 10).map(tag => {
                                const isActive = activeTopics.includes(tag);
                                const style = getTagStyle(tag);
                                return (
                                    <button
                                        key={tag}
                                        onClick={() => {
                                            setActiveTopics(prev => isActive ? prev.filter(t => t !== tag) : [...prev, tag]);
                                            setOffset?.(0);
                                        }}
                                        style={isActive ? { backgroundColor: style.color, color: 'white', borderColor: style.color } : { color: style.color, borderColor: `${style.color}40` }}
                                        className={`whitespace-nowrap px-2.5 py-1 text-xs font-bold rounded-full border transition-all ${!isActive ? 'bg-transparent' : ''}`}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>

                        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-800 text-slate-400 shrink-0">
                            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                    </>
                )}
            </header>

            {/* ─── Main Content Area ─── */}
            <div className="flex-1 overflow-hidden relative w-full">
                {currentView === 'reader' && selectedStory ? (
                    /* Mobile Reader overlay */
                    <div className="absolute inset-0 z-40 bg-[#111d2e] flex flex-col">
                        <ReaderPane
                            story={selectedStory}
                            comments={app.comments}
                            commentsLoading={app.commentsLoading}
                            activeTab={readerTab as any}
                            onTabChange={app.setReaderTab as any}
                            onFocusList={() => setCurrentView('feed')}
                            onTakeFocus={() => { }}
                            onToggleSave={user ? handleToggleSave : undefined}
                            onHide={(id) => { handleHideStory(id); setCurrentView('feed'); }}
                        />
                    </div>
                ) : (
                    /* Feed View */
                    <div className="h-full overflow-y-auto w-full flex flex-col pb-20">
                        {error && <div className="p-4 text-red-500 bg-red-950/20 text-sm text-center">{error}</div>}
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {stories.filter(s => !hiddenStories.has(s.id) && !s.is_hidden).map((story, index) => {
                                const isRead = readIds.has(story.id) || !!story.is_read;
                                const matchedTopic = activeTopics.length > 0 ? getStoryTopicMatch(story.title, story.topics, activeTopics) : null;
                                const tagStyle = matchedTopic ? getTagStyle(matchedTopic) : null;

                                return (
                                    <div
                                        key={story.id}
                                        onClick={() => {
                                            handleStoryInteractWithQueue(story.id, matchedTopic);
                                            // On mobile, interacting always opens the reader view
                                            setCurrentView('reader');
                                        }}
                                        className={`w-full p-2 active:bg-slate-800/50 transition-colors ${isRead ? 'opacity-80' : ''}`}
                                        style={tagStyle ? { borderLeft: `3px solid ${tagStyle.color}` } : undefined}
                                    >
                                        <StoryCard
                                            story={story} index={index} isSelected={false} isRead={isRead} isQueued={readingQueue.includes(story.id)} isEven={index % 2 === 0}
                                            titleColorStyle={tagStyle?.color} topicTextClass={null} onSelect={() => { }} onOpenInTab={() => { }}
                                            onToggleSave={user ? handleToggleSave : undefined} onHide={handleHideStory} onQueueToggle={handleToggleQueue}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination Bar */}
                        {!loading && !error && (
                            <div className="flex justify-between items-center px-4 py-6 text-sm">
                                <button onClick={() => setOffset(Math.max(0, offset - 10))} disabled={offset === 0} className="px-4 py-2 bg-slate-800 rounded-lg disabled:opacity-50">Prev</button>
                                <span className="text-slate-500 font-medium">Page {(offset / 10) + 1}</span>
                                <button onClick={() => setOffset(offset + 10)} disabled={!hasMore} className="px-4 py-2 bg-blue-600 rounded-lg disabled:opacity-50 font-semibold">Next</button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ─── Bottom Navigation Bar ─── */}
            <nav className="fixed bottom-0 w-full h-[65px] bg-[#1a2332] border-t border-slate-700/80 flex items-center justify-around pb-safe px-2 z-50">
                {MODES.map((m) => {
                    const isActive = mode === m.key && currentView !== 'reader';
                    const Icon = m.key === 'saved' ? Bookmark : m.key === 'show' ? Settings : Home; // Map simplified icons
                    return (
                        <button
                            key={m.key}
                            onClick={() => {
                                setMode(m.key as any);
                                setOffset?.(0);
                                setCurrentView('feed');
                            }}
                            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${isActive ? 'text-orange-500' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Icon size={20} className={isActive ? 'fill-orange-500/20' : ''} />
                            <span className="text-[10px] font-medium">{m.label}</span>
                        </button>
                    );
                })}
            </nav>

        </div>
    );
}
