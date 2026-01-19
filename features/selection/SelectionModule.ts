import type { EngineModule } from '@/engine/core/moduleHost';
import { registerCommands, registerQueries } from '@/engine/core/registry';
import { SELECTION_CHANGED } from './selection.events';

export const SelectionModule: EngineModule = {
  id: 'selection',

  init(ctx) {
    registerCommands(ctx, 'selection', {
      setSelected(ids) {
        ctx.engine.setSelected([...ids]);
        if (ctx.engine.softSelectionEnabled) ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
        ctx.events.emit(SELECTION_CHANGED, { ids: [...ids] });
      },
      modifySubSelection(type, ids, action) {
        ctx.engine.selectionSystem.modifySubSelection(type, ids, action);
        ctx.events.emit('selection:subChanged', undefined);
        ctx.engine.notifyUI();
      },
      clearSubSelection() {
        ctx.engine.selectionSystem.subSelection.vertexIds.clear();
        ctx.engine.selectionSystem.subSelection.edgeIds.clear();
        ctx.engine.selectionSystem.subSelection.faceIds.clear();
        ctx.engine.recalculateSoftSelection(true);
        ctx.events.emit('selection:subChanged', undefined);
        ctx.engine.notifyUI();
      },
      selectLoop(mode) {
        ctx.engine.selectionSystem.selectLoop(mode);
        ctx.events.emit('selection:subChanged', undefined);
      },
      selectInRect(rect, mode, action) {
        if (mode === 'OBJECT') {
            const hits = ctx.engine.selectionSystem.selectEntitiesInRect(rect.x, rect.y, rect.w, rect.h);
            
            let finalIds = hits;
            if (action === 'ADD') {
                // For OBJECT mode, ADD behaves as union
                const current = Array.from(ctx.engine.selectionSystem.selectedIndices)
                    .map(idx => ctx.engine.ecs.store.ids[idx]);
                finalIds = Array.from(new Set([...current, ...hits]));
            }
            
            ctx.engine.setSelected(finalIds);
            ctx.events.emit(SELECTION_CHANGED, { ids: finalIds });
        } 
        else if (mode === 'VERTEX') {
            // For components, we rely on modifySubSelection to handle the set logic
            const indices = ctx.engine.selectionSystem.selectVerticesInRect(rect.x, rect.y, rect.w, rect.h);
            if (indices.length > 0) {
                ctx.engine.selectionSystem.modifySubSelection('VERTEX', indices, action === 'ADD' ? 'ADD' : 'SET');
                ctx.events.emit('selection:subChanged', undefined);
            } else if (action === 'SET') {
                ctx.engine.selectionSystem.modifySubSelection('VERTEX', [], 'SET');
                ctx.events.emit('selection:subChanged', undefined);
            }
        }
        // TODO: Implement EDGE/FACE marquee support in SelectionSystem
        
        ctx.engine.notifyUI();
      },
      focus() {
        // Emit focus event so viewports can respond
        ctx.events.emit('selection:focus', undefined);
      },
      clear() {
        ctx.engine.setSelected([]);
        if (ctx.engine.softSelectionEnabled) ctx.engine.recalculateSoftSelection(true);
        ctx.engine.notifyUI();
        ctx.events.emit(SELECTION_CHANGED, { ids: [] });
      },
    });

    registerQueries(ctx, 'selection', {
      getSelectedIds() {
        const indices = ctx.engine.selectionSystem.selectedIndices;
        const ids: string[] = [];
        indices.forEach((idx: number) => {
          const id = ctx.engine.ecs.store.ids[idx];
          if (id) ids.push(id);
        });
        return ids;
      },
      getSubSelection() {
        return ctx.engine.selectionSystem.subSelection;
      }
    });
  },
};