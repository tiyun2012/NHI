import React from 'react';
import { Icon } from '@/editor/components/Icon';

export const ToolSection: React.FC<{
  title: string;
  icon?: string;
  rightBadge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, rightBadge, children, className }) => {
  return (
    <div className={`space-y-2 ${className ?? ''}`.trim()}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
          {icon ? <Icon name={icon as any} size={12} /> : null}
          {title}
        </div>
        {rightBadge}
      </div>
      {children}
    </div>
  );
};
