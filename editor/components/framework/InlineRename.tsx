
import React, { useState, useRef, useEffect } from 'react';

interface InlineRenameProps {
    value: string;
    onCommit: (newValue: string) => void;
    onCancel: () => void;
    className?: string;
}

export const InlineRename: React.FC<InlineRenameProps> = ({ value, onCommit, onCancel, className = "" }) => {
    const [tempValue, setTempValue] = useState(value);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            onCommit(tempValue);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
        }
    };

    return (
        <input 
            ref={inputRef}
            type="text"
            className={`bg-black/80 border border-accent text-white text-xs px-1 rounded outline-none min-w-[50px] w-full ${className}`}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onBlur={() => onCommit(tempValue)}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        />
    );
};
