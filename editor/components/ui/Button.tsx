
import React from 'react';
import { Icon } from '../Icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
    children, icon, variant = 'secondary', fullWidth = false, className = '', ...props 
}) => {
    const baseStyle = "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors border";
    
    const variants = {
        primary: "bg-accent border-accent text-white hover:bg-accent-hover",
        secondary: "bg-white/5 border-white/5 text-text-secondary hover:text-white hover:bg-white/10",
        danger: "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300",
        ghost: "bg-transparent border-transparent text-text-secondary hover:text-white hover:bg-white/5"
    };

    return (
        <button 
            className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
            {...props}
        >
            {icon && <Icon name={icon as any} size={14} />}
            {children}
        </button>
    );
};
