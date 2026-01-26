
import type { EngineModule } from '@/engine/core/moduleHost';
import { AIScriptPanel } from './components/AIScriptPanel';

export const AIModule: EngineModule = {
  id: 'ai-assistant',

  init(ctx) {
    // Register the AI Assistant Window
    ctx.commands.ui?.registerWindow?.({
      id: 'ai_script_panel',
      title: 'AI Architect',
      icon: 'Bot',
      component: AIScriptPanel,
      width: 350,
      height: 500
    });
    
    // Optional: Register a menu item or shortcut in future
  }
};
