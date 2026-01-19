
import React from 'react';

export type UILocation = 'TOOL_OPTIONS' | 'INSPECTOR' | 'GLOBAL';

export interface UISection {
    id: string;
    title: string;
    icon?: string;
    component: React.ComponentType;
    order: number;
}

class UIRegistryService {
    private sections = new Map<UILocation, UISection[]>();

    registerSection(location: UILocation, section: UISection) {
        if (!this.sections.has(location)) {
            this.sections.set(location, []);
        }
        const list = this.sections.get(location)!;
        // Prevent duplicates
        if (list.some(s => s.id === section.id)) return;
        
        list.push(section);
        list.sort((a, b) => a.order - b.order);
    }

    getSections(location: UILocation): UISection[] {
        return this.sections.get(location) || [];
    }
}

export const uiRegistry = new UIRegistryService();
