
import React from 'react';

interface ColorInputProps {
    label?: string;
    value: string; // Hex
    onChange: (hex: string) => void;
    className?: string;
}

export const ColorInput: React.FC<ColorInputProps> = ({ label, value, onChange, className }) => {
    return (
        <div className={`flex items-center gap-2 ${className || ''}`}>
            {label && <span className="w-24 text-text-secondary text-[10px]">{label}</span>}
            <div className="flex-1 h-6 relative bg-black/20 rounded border border-white/5 overflow-hidden flex items-center">
                <input 
                    type="color" 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)} 
                    className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer border-none p-0"
                />
                <span className="ml-8 text-[10px] font-mono text-white pointer-events-none uppercase">{value}</span>
            </div>
        </div>
    );
};
