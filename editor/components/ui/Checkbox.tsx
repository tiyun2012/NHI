
import React from 'react';

interface CheckboxProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange, disabled, className }) => {
    return (
        <label className={`flex items-center justify-between cursor-pointer group ${className || ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span className="text-xs text-text-primary group-hover:text-white transition-colors">{label}</span>
            <input 
                type="checkbox" 
                checked={checked} 
                onChange={(e) => !disabled && onChange(e.target.checked)} 
                className="accent-accent cursor-pointer"
                disabled={disabled}
            />
        </label>
    );
};
