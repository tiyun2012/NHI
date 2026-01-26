
import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Icon } from '@/editor/components/Icon';
import { engineInstance } from '@/engine/engine';
import { consoleService } from '@/engine/Console';

export const AIScriptPanel: React.FC = () => {
  const [prompt, setPrompt] = useState('Make all objects float up and down like a wave');
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!process.env.API_KEY) {
        setError("API_KEY not found. Please check your .env.local file.");
        return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
          You are a scripting assistant for a high-performance custom ECS game engine.
          The ECS data is stored in 'ecs.store' using Structure-of-Arrays (SoA) for cache efficiency.
          
          Available Arrays in 'ecs.store' (Float32Array unless specified):
          - Position: posX, posY, posZ
          - Rotation (Euler): rotX, rotY, rotZ
          - Scale: scaleX, scaleY, scaleZ
          - Color: colorR, colorG, colorB
          - Physics: velocityX, velocityY, velocityZ (if available), mass
          - Metadata: isActive (Uint8Array)
          
          Variable 'ecs.count' holds the number of entities.
          Variables 'time' (seconds) and 'dt' (delta time) are available.
          
          Task: Write a JavaScript code snippet (function body only) to ${prompt}.
          
          Rules:
          1. Iterate using a standard for-loop up to 'ecs.count'.
          2. Check 'ecs.store.isActive[i]' before modifying.
          3. DIRECTLY modify the arrays. Do NOT use setPosition/setRotation methods inside the loop for performance.
          4. Do NOT wrap in a function signature. Just the logic.
          5. Use Math.sin, Math.cos, etc. directly.
          
          Example Output:
          for(let i=0; i<ecs.count; i++) {
            if(ecs.store.isActive[i]) {
                ecs.store.posY[i] = Math.sin(time + i * 0.5) * 2.0;
                ecs.store.rotY[i] += dt * 1.0;
            }
          }
        `,
      });

      const code = response.text || '';
      // Strip markdown code blocks
      const cleanCode = code.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();
      setGeneratedCode(cleanCode);
    } catch (err: any) {
        setError(err.message || "Failed to generate script");
        consoleService.error(err.message, "AI Assistant");
    } finally {
      setLoading(false);
    }
  };

  const handleRun = () => {
      if (!generatedCode) return;
      try {
          // Wrap code in a function that receives context
          // We pass 'ecs' (the engine system), 'time', and 'dt'
          const func = new Function('ecs', 'time', 'dt', generatedCode);
          
          // Execute immediately (One-shot)
          // For continuous execution, we would need to hook into the update loop, 
          // but for this editor tool, we'll apply it as a one-off or simulation step.
          // To make it interesting, we'll simulate a few seconds if it uses time, 
          // or just run it once.
          
          // Actually, let's run it once with current time.
          func(engineInstance.ecs, engineInstance.timeline.currentTime, 0.016);
          
          // Notify engine to update scene graph after modifying raw arrays
          engineInstance.ecs.store.transformDirty.fill(1); // Mark all dirty
          engineInstance.notifyUI();
          
          consoleService.success("Script executed successfully", "AI Assistant");
      } catch (e: any) {
          setError(e.message);
          consoleService.error(e.message, "AI Script Execution");
      }
  };

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] p-4 text-xs font-sans">
      <div className="flex items-center gap-2 mb-4 text-emerald-400">
        <Icon name="Bot" size={18} />
        <h2 className="font-bold text-sm uppercase tracking-wider">AI Script Architect</h2>
      </div>

      <div className="space-y-2 mb-4">
          <label className="text-[10px] font-bold text-text-secondary uppercase">Prompt</label>
          <textarea
            className="w-full h-20 bg-black/40 border border-white/10 rounded p-2 text-white focus:border-accent outline-none resize-none placeholder:text-white/20"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. Arrange all objects in a circle..."
          />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`flex items-center justify-center gap-2 py-2 rounded font-bold transition-all mb-4
            ${loading ? 'bg-white/10 text-text-secondary cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'}
        `}
      >
        {loading ? <Icon name="Loader2" className="animate-spin" size={14} /> : <Icon name="Wand2" size={14} />}
        {loading ? 'Generating Logic...' : 'Generate Script'}
      </button>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-2 rounded mb-4 flex gap-2 items-start">
            <Icon name="AlertCircle" size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 bg-black/40 border border-white/10 rounded overflow-hidden">
        <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex justify-between items-center">
            <span className="text-[10px] font-bold text-text-secondary uppercase">Generated Code</span>
            <button 
                onClick={() => navigator.clipboard.writeText(generatedCode)}
                className="hover:text-white text-text-secondary"
                title="Copy Code"
            >
                <Icon name="Copy" size={12} />
            </button>
        </div>
        <textarea
          className="flex-1 bg-transparent p-3 font-mono text-emerald-400 text-[11px] resize-none outline-none"
          value={generatedCode}
          onChange={(e) => setGeneratedCode(e.target.value)}
          spellCheck={false}
          placeholder="// Generated code will appear here..."
        />
      </div>
      
      <div className="mt-4">
        <button
            onClick={handleRun}
            disabled={!generatedCode}
            className={`w-full flex items-center justify-center gap-2 py-2 rounded font-bold transition-all
                ${!generatedCode ? 'bg-white/5 text-text-secondary opacity-50 cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20'}
            `}
        >
            <Icon name="Play" size={14} /> Run Script
        </button>
        <div className="text-center mt-2 text-[9px] text-text-secondary opacity-60">
            Executes immediately on active ECS state.
        </div>
      </div>
    </div>
  );
};
