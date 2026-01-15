
import type { EngineModule } from '@/engine/core/moduleHost';
import { SelectionModule } from '@/features/selection/SelectionModule';
import { SceneModule } from '@/features/scene/SceneModule';
import { CoreModule } from '@/features/core/CoreModule';
import { HistoryModule } from '@/features/history/HistoryModule';
import { UIModule } from '@/features/ui/UIModule';
import { SculptModule } from '@/features/sculpt/SculptModule';
import { ModelingModule } from '@/features/modeling/ModelingModule';

export const MODULES: readonly EngineModule[] = [
  CoreModule,
  SceneModule,
  SelectionModule,
  HistoryModule,
  UIModule,
  SculptModule,
  ModelingModule
];
