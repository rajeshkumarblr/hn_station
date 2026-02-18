import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';

interface FilterComboBoxProps {
    options: string[];
    selected: string[];
    onSelect: (selected: string[]) => void;
}

export function FilterComboBox({ options, selected, onSelect }: FilterComboBoxProps) {
    const [inputValue, setInputValue] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        const lowerOption = option.toLowerCase();
        const newSelected = selected.includes(lowerOption)
            ? selected.filter(s => s !== lowerOption)
            : [...selected, lowerOption];
        onSelect(newSelected);
        // Keep focus on input
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const trimmed = inputValue.trim().toLowerCase();
            if (trimmed) {
                if (!selected.includes(trimmed)) {
                    onSelect([...selected, trimmed]);
                }
                setInputValue('');
                setIsOpen(false);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    // Filter options based on input
    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(inputValue.toLowerCase())
    );

    return (
        <div className="relative w-full max-w-[300px]" ref={containerRef}>
            <div className="relative flex items-center">
                <Search size={14} className="absolute left-3 text-slate-500 z-10 pointers-events-none" />
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder="Filter... (/)"
                    className="w-full bg-slate-800 border border-slate-700 focus:border-blue-500 rounded-md pl-9 pr-8 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all placeholder-slate-500"
                />
                <button
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (!isOpen) inputRef.current?.focus();
                    }}
                    className="absolute right-0 top-0 bottom-0 px-2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                    <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-full bg-[#1a2332] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 max-h-60 overflow-y-auto custom-scrollbar">
                    <div className="p-1 space-y-0.5">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => {
                                const isSelected = selected.includes(option.toLowerCase());
                                return (
                                    <button
                                        key={option}
                                        onClick={() => toggleOption(option)}
                                        className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left hover:bg-slate-700/50 transition-colors group"
                                    >
                                        <span className={isSelected ? 'text-orange-400 font-medium' : 'text-slate-300'}>
                                            {option}
                                        </span>
                                        {isSelected && <Check size={12} className="text-orange-500" strokeWidth={3} />}
                                    </button>
                                );
                            })
                        ) : (
                            <div className="px-3 py-2 text-xs text-slate-500 text-center">
                                Press Enter to add "{inputValue}"
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
