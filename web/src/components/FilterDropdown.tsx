import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, Check } from 'lucide-react';

interface FilterDropdownProps {
    options: string[];
    selected: string[];
    onChange: (selected: string[]) => void;
}

export function FilterDropdown({ options, selected, onChange }: FilterDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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
        onChange(newSelected);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${selected.length > 0
                    ? 'bg-orange-500/15 text-orange-400 border-orange-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200'
                    }`}
            >
                <Filter size={12} />
                <span>Filter{selected.length > 0 ? ` (${selected.length})` : ''}</span>
                <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-[#1a2332] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-1.5 space-y-0.5">
                        {options.map(option => {
                            const isSelected = selected.includes(option.toLowerCase());
                            return (
                                <button
                                    key={option}
                                    onClick={() => toggleOption(option)}
                                    className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left hover:bg-slate-700/50 transition-colors group"
                                >
                                    <span className={isSelected ? 'text-orange-400 font-medium' : 'text-slate-300'}>{option}</span>
                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${isSelected
                                        ? 'bg-orange-500 border-orange-500 text-white'
                                        : 'border-slate-600 group-hover:border-slate-500'
                                        }`}>
                                        {isSelected && <Check size={10} strokeWidth={3} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
