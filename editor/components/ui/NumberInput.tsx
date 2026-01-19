
import React from 'react';

interface NumberInputProps {
    label?: string;
    value: number;
    onChange: (val: number) => void;
    step?: number;
    min?: number;
    max?: number;
    color?: string; // Text color class
    disabled?: boolean;
    className?: string;
}

export const NumberInput: React.FC<NumberInputProps> = ({ 
    label, value, onChange, step = 0.01, min, max, color, disabled, className 
}) => {
    return (
        <div className={`flex items-center bg-black/20 rounded overflow-hidden border border-transparent ${disabled ? 'opacity-50' : 'focus-within:border-accent'} group ${className || ''}`}>
            {label && (
                <div className={`w-6 flex items-center justify-center text-[10px] font-bold h-6 ${color || 'text-text-secondary'}`}>
                    {label}
                </div>
            )}
            <input 
                type="number" 
                className={`flex-1 bg-transparent text-xs p-1 outline-none text-white min-w-0 text-right pr-2 ${disabled ? 'cursor-not-allowed' : ''}`} 
                value={value === undefined ? 0 : Number(value).toFixed(step < 0.01 ? 3 : 2)} 
                onChange={e => {
                    if (disabled) return;
                    let v = parseFloat(e.target.value);
                    if (min !== undefined) v = Math.max(min, v);
                    if (max !== undefined) v = Math.min(max, v);
                    onChange(v);
                }} 
                step={step}
                disabled={disabled}
            />
        </div>
    );
};
