import React, { useEffect, useRef, useState, useContext } from 'react';
import { EditorContext } from '@/editor/state/EditorContext';

export interface BrushStateBindings {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  radius: number;
  setRadius: (radius: number) => void;
  heatmapVisible: boolean;
  setHeatmapVisible: (visible: boolean) => void;
}

interface BrushInteractionOptions {
  /** If provided, brush interactions (B tap / B+drag) will only apply when this returns true. */
  isBrushContextEnabled?: () => boolean;
  /** Only activate brush interaction when the initial mouse down occurred inside this scope. */
  scopeRef?: React.RefObject<HTMLElement>;
  onBrushAdjustStart?: () => void;
  onBrushAdjustEnd?: () => void;
  /**
   * Optional override for which soft-selection state to manipulate.
   * If omitted, the hook will use EditorContext (scene viewport behavior).
   */
  brushState?: BrushStateBindings;
}

type Subscriber = {
  id: number;
  getScope: () => HTMLElement | null;
  setIsAdjusting: (v: boolean) => void;
  brushKeyRef: React.MutableRefObject<boolean>;
  onStart?: () => void;
  onEnd?: () => void;

  enabledRef: React.MutableRefObject<boolean>;
  radiusRef: React.MutableRefObject<number>;
  heatmapRef: React.MutableRefObject<boolean>;

  setEnabledRef: React.MutableRefObject<((v: boolean) => void) | null>;
  setRadiusRef: React.MutableRefObject<((v: number) => void) | null>;
  setHeatmapRef: React.MutableRefObject<((v: boolean) => void) | null>;

  isBrushContextEnabledRef: React.MutableRefObject<(() => boolean) | null>;
};

// -----------------------
// Global (singleton) state
// -----------------------

let installed = false;
let nextSubId = 1;
const subscribers: Subscriber[] = [];

let activeSubId: number | null = null;
let hoveredSubId: number | null = null;
let focusedSubId: number | null = null;
let isAdjustingGlobal = false;
let bKeyHeldGlobal = false;
let dragHappened = false;
let brushStart = { x: 0, y: 0, startRadius: 1 };

function setAllBrushKeyRefs(v: boolean) {
  for (const sub of subscribers) {
    const allow = allowsBrushForSub(sub);
    sub.brushKeyRef.current = v && allow;
  }
}

function setAdjustingForActive() {
  for (const sub of subscribers) sub.setIsAdjusting(activeSubId === sub.id && isAdjustingGlobal);
}

function allowsBrushForSub(sub: Subscriber | null): boolean {
  if (!sub) return false;
  const fn = sub.isBrushContextEnabledRef.current;
  try {
    return fn ? !!fn() : true;
  } catch {
    return true;
  }
}

function findSubscriberForEventTarget(target: EventTarget | null): Subscriber | null {
  if (!target || !(target instanceof Node)) return null;
  // Prefer the most recently registered subscriber (top-most mounted viewport)
  for (let i = subscribers.length - 1; i >= 0; i--) {
    const sub = subscribers[i];
    const scope = sub.getScope();
    if (scope && scope.contains(target)) return sub;
  }
  return null;
}

function getSubById(id: number | null): Subscriber | null {
  if (id == null) return null;
  return subscribers.find((s) => s.id === id) ?? null;
}

function getBestTargetSubscriber(): Subscriber | null {
  // Prefer hovered, then focused (last click), then active (if any), then most recently registered.
  const preferred: Array<Subscriber | null> = [
    getSubById(hoveredSubId),
    getSubById(focusedSubId),
    getSubById(activeSubId),
  ];

  for (const c of preferred) {
    if (c && allowsBrushForSub(c)) return c;
  }

  for (let i = subscribers.length - 1; i >= 0; i--) {
    const s = subscribers[i];
    if (allowsBrushForSub(s)) return s;
  }

  // If nothing allows brush (e.g. all viewports are in OBJECT mode), fall back to best effort.
  return (
    getSubById(hoveredSubId) ||
    getSubById(focusedSubId) ||
    getSubById(activeSubId) ||
    (subscribers.length ? subscribers[subscribers.length - 1] : null)
  );
}

function ensureInstalled() {
  if (installed) return;
  installed = true;

  const isTypingInInput = () => {
    const ae = document.activeElement as HTMLElement | null;
    return !!(ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingInInput()) return;
    if ((e.key === 'b' || e.key === 'B') && !e.repeat) {
      bKeyHeldGlobal = true;
      dragHappened = false;
      setAllBrushKeyRefs(true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingInInput()) return;
    if (e.key !== 'b' && e.key !== 'B') return;

    bKeyHeldGlobal = false;
    setAllBrushKeyRefs(false);

    // Toggle soft selection (tap) on the hovered viewport only.
    if (!dragHappened) {
      const sub = getBestTargetSubscriber();
      const setEnabled = sub?.setEnabledRef.current;
      if (sub && setEnabled) {
        const next = !sub.enabledRef.current;
        setEnabled(next);
        sub.enabledRef.current = next;

        // UX parity: when toggling sculpt/soft selection via B, also toggle heatmap.
        const setHeat = sub.setHeatmapRef.current;
        if (setHeat) {
          setHeat(next);
          sub.heatmapRef.current = next;
        }
      }
    }

    dragHappened = false;
  };

  const onMouseMove = (e: MouseEvent) => {
    // Track hovered viewport for B-tap routing.
    const hovered = findSubscriberForEventTarget(e.target);
    hoveredSubId = hovered?.id ?? null;
    // Track the last viewport the user interacted with (for B tap routing)
    focusedSubId = hovered?.id ?? focusedSubId;

    if (!isAdjustingGlobal || activeSubId == null) return;

    const sub = getSubById(activeSubId);
    if (!sub) return;

    const setRadius = sub.setRadiusRef.current;
    if (!setRadius) return;

    // Keep consistent with existing feel: horizontal drag adjusts radius.
    const dx = e.clientX - brushStart.x;
    const newRadius = Math.max(0.1, brushStart.startRadius + dx * 0.01);

    setRadius(newRadius);
    sub.radiusRef.current = newRadius;

    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseDown = (e: MouseEvent) => {
    // Update hovered immediately on clicks.
    const hovered = findSubscriberForEventTarget(e.target);
    hoveredSubId = hovered?.id ?? null;
    // Track the last viewport the user interacted with (for B tap routing)
    focusedSubId = hovered?.id ?? focusedSubId;

    if (!bKeyHeldGlobal || e.button !== 0) return;
    const sub = hovered;
    if (!sub) return;
    if (!allowsBrushForSub(sub)) return;

    dragHappened = true;

    // Prevent viewport selection/gizmo drags while adjusting brush radius
    e.preventDefault();
    e.stopPropagation();

    const setEnabled = sub.setEnabledRef.current;
    const setHeat = sub.setHeatmapRef.current;

    // Auto-enable soft selection when adjusting brush radius
    if (!sub.enabledRef.current && setEnabled) {
      setEnabled(true);
      sub.enabledRef.current = true;
    }

    // Ensure heatmap is visible so the user can see the influence falloff.
    if (!sub.heatmapRef.current && setHeat) {
      setHeat(true);
      sub.heatmapRef.current = true;
    }

    activeSubId = sub.id;
    isAdjustingGlobal = true;
    brushStart = { x: e.clientX, y: e.clientY, startRadius: sub.radiusRef.current };

    sub.onStart?.();
    setAdjustingForActive();
  };

  const onMouseUp = (_e: MouseEvent) => {
    if (!isAdjustingGlobal || activeSubId == null) return;

    const sub = getSubById(activeSubId);

    isAdjustingGlobal = false;
    activeSubId = null;

    sub?.onEnd?.();
    setAdjustingForActive();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  // Capture so we can stop the viewport handlers from seeing B+LMB drags
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
}

// -----------------------
// Hook
// -----------------------

export const useBrushInteraction = (options: BrushInteractionOptions = {}) => {
  const editorCtx = useContext(EditorContext);

  const brushKeyRef = useRef<boolean>(false);
  const [isAdjustingBrush, setIsAdjustingBrush] = useState<boolean>(false);
  const isBrushContextEnabledRef = useRef<(() => boolean) | null>(options.isBrushContextEnabled ?? null);
  useEffect(() => {
    isBrushContextEnabledRef.current = options.isBrushContextEnabled ?? null;
    // If B is currently held, refresh key refs to respect updated context gating.
    setAllBrushKeyRefs(bKeyHeldGlobal);
  }, [options.isBrushContextEnabled]);

  // Per-viewport soft-selection bindings (either explicit or via EditorContext)
  const enabledRef = useRef<boolean>(options.brushState?.enabled ?? editorCtx?.softSelectionEnabled ?? false);
  const radiusRef = useRef<number>(options.brushState?.radius ?? editorCtx?.softSelectionRadius ?? 1);
  const heatmapRef = useRef<boolean>(options.brushState?.heatmapVisible ?? editorCtx?.softSelectionHeatmapVisible ?? false);

  const setEnabledRef = useRef<((v: boolean) => void) | null>(options.brushState?.setEnabled ?? editorCtx?.setSoftSelectionEnabled ?? null);
  const setRadiusRef = useRef<((v: number) => void) | null>(options.brushState?.setRadius ?? editorCtx?.setSoftSelectionRadius ?? null);
  const setHeatmapRef = useRef<((v: boolean) => void) | null>(options.brushState?.setHeatmapVisible ?? editorCtx?.setSoftSelectionHeatmapVisible ?? null);

  // Keep refs fresh
  useEffect(() => {
    enabledRef.current = options.brushState?.enabled ?? editorCtx?.softSelectionEnabled ?? enabledRef.current;
    radiusRef.current = options.brushState?.radius ?? editorCtx?.softSelectionRadius ?? radiusRef.current;
    heatmapRef.current = options.brushState?.heatmapVisible ?? editorCtx?.softSelectionHeatmapVisible ?? heatmapRef.current;

    setEnabledRef.current = options.brushState?.setEnabled ?? editorCtx?.setSoftSelectionEnabled ?? setEnabledRef.current;
    setRadiusRef.current = options.brushState?.setRadius ?? editorCtx?.setSoftSelectionRadius ?? setRadiusRef.current;
    setHeatmapRef.current = options.brushState?.setHeatmapVisible ?? editorCtx?.setSoftSelectionHeatmapVisible ?? setHeatmapRef.current;
  }, [
    editorCtx?.softSelectionEnabled,
    editorCtx?.softSelectionRadius,
    editorCtx?.softSelectionHeatmapVisible,
    editorCtx?.setSoftSelectionEnabled,
    editorCtx?.setSoftSelectionRadius,
    editorCtx?.setSoftSelectionHeatmapVisible,
    options.brushState?.enabled,
    options.brushState?.radius,
    options.brushState?.heatmapVisible,
    options.brushState?.setEnabled,
    options.brushState?.setRadius,
    options.brushState?.setHeatmapVisible,
  ]);

  // Register this scope as a subscriber
  useEffect(() => {
    ensureInstalled();

    const id = nextSubId++;

    const getScope = () => options.scopeRef?.current ?? null;

    const sub: Subscriber = {
      id,
      getScope,
      setIsAdjusting: (v: boolean) => setIsAdjustingBrush(v),
      brushKeyRef,
      onStart: options.onBrushAdjustStart,
      onEnd: options.onBrushAdjustEnd,
      enabledRef,
      radiusRef,
      heatmapRef,
      setEnabledRef,
      setRadiusRef,
      setHeatmapRef,
      isBrushContextEnabledRef,
    };

    subscribers.push(sub);
    // Initialize local ref with current key state
    brushKeyRef.current = bKeyHeldGlobal;

    return () => {
      const idx = subscribers.findIndex((s) => s.id === id);
      if (idx >= 0) subscribers.splice(idx, 1);

      // If the active subscriber disappeared mid-drag, cancel
      if (activeSubId === id) {
        activeSubId = null;
        isAdjustingGlobal = false;
        setAdjustingForActive();
      }

      if (hoveredSubId === id) hoveredSubId = null;
      if (focusedSubId === id) focusedSubId = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isAdjustingBrush, isBrushKeyHeld: brushKeyRef };
};