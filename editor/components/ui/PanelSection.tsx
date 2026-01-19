
import React, { useState } from 'react';
import { Icon } from '../Icon';

interface PanelSectionProps {
    title: string;
    icon?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    rightElement?: React.ReactNode;
}

export const PanelSection: React.FC<PanelSectionProps> = ({ title, icon, defaultOpen = true, children, rightElement }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-panel-header border-b border-black/20">
            <div 
                className="flex items-center p-2 cursor-pointer hover:bg-white/5 select-none group" 
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="mr-2 text-text-secondary group-hover:text-white transition-colors">
                    <Icon name={isOpen ? 'ChevronDown' : 'ChevronRight'} size={12} />
                </div>
                {icon && <Icon name={icon as any} size={14} className="mr-2 text-accent" />}
                <span className="font-semibold text-xs text-gray-200 flex-1">{title}</span>
                {rightElement && <div onClick={e => e.stopPropagation()}>{rightElement}</div>}
            </div>
            {isOpen && (
                <div className="p-3 bg-panel border-t border-black/10 text-xs space-y-3">
                    {children}
                </div>
            )}
        </div>
    );
};
