
import type { UIConfiguration, GridConfiguration, SnapSettings } from '@/types';

export const DEFAULT_UI_CONFIG: UIConfiguration = {
    windowBorderRadius: 8,
    resizeHandleThickness: 6,
    resizeHandleColor: '#4f80f8',
    resizeHandleOpacity: 0.2,
    resizeHandleLength: 1.0,
    selectionEdgeHighlight: true,
    selectionEdgeColor: '#4f80f8', // Unity Blue
    showVertexOverlay: true, // Default ON
    vertexSize: 1.0,
    vertexColor: '#a855f7', // Purple
};

export const DEFAULT_GRID_CONFIG: GridConfiguration = {
    visible: true,
    size: 1.0,         // 1 Meter primary lines
    subdivisions: 10,  // 10cm sub-divisions (Maya style)
    opacity: 0.9,
    fadeDistance: 400.0,
    color: '#808080',
    excludeFromPostProcess: false,
};

export const DEFAULT_SNAP_CONFIG: SnapSettings = {
    active: false,
    move: 0.5,
    rotate: 15.0,
    scale: 0.1,
};
