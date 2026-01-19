
import React from 'react';

type ToolPanelComponent = React.FC<any>;

class ToolRegistryService {
    private panels = new Map<string, ToolPanelComponent>();

    register(toolId: string, component: ToolPanelComponent) {
        this.panels.set(toolId, component);
    }

    get(toolId: string): ToolPanelComponent | undefined {
        return this.panels.get(toolId);
    }
}

export const toolRegistry = new ToolRegistryService();
