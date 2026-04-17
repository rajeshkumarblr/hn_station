$path = "c:\Users\rajes\proj\hn_station\web\src\components\ReaderPane.tsx"
$content = Get-Content $path -Raw

# 1. Update Props Interface
$oldProps = 'interface ReaderPaneProps \{[^\}]+\}'
$newProps = 'interface ReaderPaneProps {
    story: Story;
    onBack?: () => void;
    onHome?: () => void;
    onTakeFocus?: () => void;
    initialActiveCommentId?: string | null;
    onSaveProgress?: (commentId: string) => void;
    onToggleSave?: (id: number, saved: boolean) => void;
    activeTab?: ''discussion'' | ''article'' | ''split'';
    onTabChange?: (tab: ''discussion'' | ''article'' | ''split'') => void;
    onHide?: (id: number) => void;
    isActive?: boolean;
    onSetGlobalWarning?: (msg: string | null) => void;
    onSetIframeBlocked?: (storyId: number, blocked: boolean) => void;
    user?: any;
    onOpenSettings?: () => void;
    isAISidebarOpen?: boolean;
    onToggleAISidebar?: (open: boolean) => void;
}'
$content = $content -replace $oldProps, $newProps

# 2. Update Function Signature
$oldSig = 'export function ReaderPane\(\{ story, onBack, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab: activeTabProp, onTabChange, onHide, onSetGlobalWarning, onSetIframeBlocked, user, onOpenSettings \}: ReaderPaneProps\) \{'
$newSig = 'export function ReaderPane({ 
    story, onBack, onHome, onTakeFocus, initialActiveCommentId, onSaveProgress, onToggleSave, activeTab: activeTabProp, onTabChange, onHide, onSetGlobalWarning, onSetIframeBlocked, user, onOpenSettings,
    isAISidebarOpen = false,
    onToggleAISidebar
}: ReaderPaneProps) {'
$content = $content -replace $oldSig, $newSig

# 3. Remove local state
$oldState = '\s+const \[isAISidebarOpen, setIsAISidebarOpen\] = useState\(false\);'
$content = $content -replace $oldState, ''

# 4. Update Sparkles Click
$oldSparkles = 'onClick=\{\(\) =\> setIsAISidebarOpen\(!isAISidebarOpen\)\}'
$newSparkles = 'onClick={() => onToggleAISidebar?.(!isAISidebarOpen)}'
$content = $content -replace $oldSparkles, $newSparkles

# 5. Update AISidebar onClose and parent tab reset logic
$oldClose = 'onClose=\{\(\) =\> \{[^\}]*setIsAISidebarOpen\(false\);[^\}]*setActiveTab\(''split''\);[^\}]*\}\}'
$newClose = 'onClose={() => {
                            onToggleAISidebar?.(false);
                            setActiveTab(''split'');
                        }}'
$content = $content -replace $oldClose, $newClose

# Write back
$content | Set-Content $path -NoNewline
