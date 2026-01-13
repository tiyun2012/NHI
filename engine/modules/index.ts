
import type { EngineModule } from '@/engine/core/moduleHost';
import { SelectionModule } from '@/features/selection/SelectionModule';
import { SceneModule } from '@/features/scene/SceneModule';
import { CoreModule } from '@/features/core/CoreModule';

export const MODULES: readonly EngineModule[] = [
  CoreModule,
  SceneModule,
  SelectionModule,
];
