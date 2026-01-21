
import React from 'react';

export type UILocation = 'TOOL_OPTIONS' | 'INSPECTOR' | 'GLOBAL';

export interface UISection {
    id: string;
    title: string;
    icon?: string;
    component: React.ComponentType;
    order: number;
}

export interface UIWindow {
    id: string;
    title: string;
    icon: string;
    component: React.ComponentType;
    width?: number;
    height?: number;
    initialPosition?: { x: number, y: number };
}

class UIRegistryService {
    private sections = new Map<UILocation, UISection[]>();
    private windows = new Map<string, UIWindow>();
    private listeners = new Set<() => void>();

    registerSection(location: UILocation, section: UISection) {
        if (!this.sections.has(location)) {
            this.sections.set(location, []);
        }
        const list = this.sections.get(location)!;
        // Prevent duplicates
        if (list.some(s => s.id === section.id)) return;
        
        list.push(section);
        list.sort((a, b) => a.order - b.order);
        this.notify();
    }

    registerWindow(window: UIWindow) {
        this.windows.set(window.id, window);
        this.notify();
    }

    getSections(location: UILocation): UISection[] {
        return this.sections.get(location) || [];
    }

    getWindows(): UIWindow[] {
        return Array.from(this.windows.values());
    }

    subscribe(cb: () => void) {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    }

    private notify() {
        this.listeners.forEach(cb => cb());
    }
}

export const uiRegistry = new UIRegistryService();
