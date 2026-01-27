
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Icon } from './Icon';
import { consoleService, LogEntry, LogType } from '@/engine/Console';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { engineInstance } from '@/engine/engine';

type ConsoleTab = 'LOGS' | 'HISTORY';

const NOISY_PATTERNS = [
    'ui.setFocusedWidget',
    'ui.notify',
    'selection.highlight'
];

// Fix: Restore truncated component code and ensure it returns a valid JSX element.
export const ConsolePanel: React.FC = () => {
    const api = useEngineAPI();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [activeTab, setActiveTab] = useState<ConsoleTab>('LOGS');
    const [filterError, setFilterError] = useState(true);
    const [filterWarn, setFilterWarn] = useState(true);
    const [filterInfo, setFilterInfo] = useState(true);
    const [hideNoise, setHideNoise] = useState(true); // Default to hiding noise
    
    // Auto-scroll logic
    const [autoScroll, setAutoScroll] = useState(true);
    const listRef = useRef<HTMLDivElement>(null);

    // Command Input State
    const [command, setCommand] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useEffect(() => {
        const unsubscribe = consoleService.subscribe(() => {
            setLogs([...consoleService.getLogs()]);
        });
        setLogs([...consoleService.getLogs()]);
        return unsubscribe;
    }, []);

    // Smart Scrolling: Only auto-scroll if we were already near bottom or autoScroll is forced
    useLayoutEffect(() => {
        const list = listRef.current;
        if (!list) return;

        if (autoScroll) {
            list.scrollTop = list.scrollHeight;
        }
    }, [logs, autoScroll, activeTab, filterError, filterWarn, filterInfo, hideNoise]);

    const handleScroll = () => {
        const list = listRef.current;
        if (!list) return;
        const diff = list.scrollHeight - list.scrollTop - list.clientHeight;
        // If user scrolls up significantly (more than 10px), disable auto-scroll
        if (diff > 10) {
            setAutoScroll(false);
        } else {
            setAutoScroll(true);
        }
    };

    const getFilteredLogs = () => {
        if (activeTab === 'HISTORY') {
            return logs.filter(l => l.type === 'command' || (l.source === 'Result' || l.source === 'API'));
        }
        return logs.filter(l => {
            if (l.type === 'error' && !filterError) return false;
            if (l.type === 'warn' && !filterWarn) return false;
            if (l.type === 'info' && !filterInfo && l.source !== 'Result') return false; 
            
            // Noise Filter
            if (hideNoise && l.type === 'info' && NOISY_PATTERNS.some(p => l.message.includes(p))) return false;
            
            return true;
        });
    };

    const executeCommand = (cmd: string) => {
        if (!cmd.trim()) return;
        
        consoleService.cmd(`> ${cmd}`);
        setHistory(prev => [cmd, ...prev.slice(0, 49)]);
        setHistoryIndex(-1);
        
        try {
            // Unsafe but standard for internal engine consoles
            // eslint-disable-next-line no-eval
            const result = eval(cmd);
            if (result !== undefined) {
                consoleService.log(String(result), 'info', 'Result');
            }
        } catch (e: any) {
            consoleService.error(e.message, 'Eval');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            executeCommand(command);
            setCommand('');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex < history.length - 1) {
                const newIdx = historyIndex + 1;
                setHistoryIndex(newIdx);
                setCommand(history[newIdx]);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIdx = historyIndex - 1;
                setHistoryIndex(newIdx);
                setCommand(history[newIdx]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setCommand('');
            }
        }
    };

    const getTypeColor = (type: LogType) => {
        switch (type) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-yellow-400';
            case 'success': return 'text-emerald-400';
            case 'command': return 'text-blue-400 font-bold';
            default: return 'text-gray-300';
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#111] font-mono text-[11px] select-text overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center gap-2 p-1.5 bg-panel-header border-b border-white/5 shrink-0">
                <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                    <button 
                        onClick={() => setActiveTab('LOGS')}
                        className={`px-2 py-0.5 rounded transition-all ${activeTab === 'LOGS' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'}`}
                    >
                        Logs
                    </button>
                    <button 
                        onClick={() => setActiveTab('HISTORY')}
                        className={`px-2 py-0.5 rounded transition-all ${activeTab === 'HISTORY' ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-white'}`}
                    >
                        History
                    </button>
                </div>

                <div className="h-4 w-px bg-white/10 mx-1"></div>

                <div className="flex gap-2 items-center">
                    <button 
                        onClick={() => setFilterError(!filterError)}
                        className={`flex items-center gap-1 transition-colors ${filterError ? 'text-red-400' : 'text-text-secondary opacity-40'}`}
                    >
                        <Icon name="XCircle" size={10} /> Errors
                    </button>
                    <button 
                        onClick={() => setFilterWarn(!filterWarn)}
                        className={`flex items-center gap-1 transition-colors ${filterWarn ? 'text-yellow-400' : 'text-text-secondary opacity-40'}`}
                    >
                        <Icon name="AlertTriangle" size={10} /> Warn
                    </button>
                    <button 
                        onClick={() => setFilterInfo(!filterInfo)}
                        className={`flex items-center gap-1 transition-colors ${filterInfo ? 'text-gray-300' : 'text-text-secondary opacity-40'}`}
                    >
                        <Icon name="Info" size={10} /> Info
                    </button>
                </div>

                <div className="flex-1"></div>

                <button 
                    onClick={() => setHideNoise(!hideNoise)}
                    className={`px-2 py-0.5 rounded border border-white/5 text-[9px] uppercase font-bold transition-all ${hideNoise ? 'bg-indigo-500/20 text-indigo-300' : 'text-text-secondary'}`}
                    title="Toggle Noisy Pattern Filter"
                >
                    {hideNoise ? 'Filter ON' : 'Filter OFF'}
                </button>

                <button 
                    onClick={() => consoleService.clear()}
                    className="p-1 hover:text-red-400 text-text-secondary"
                    title="Clear Console"
                >
                    <Icon name="Trash2" size={12} />
                </button>
            </div>

            {/* Log List */}
            <div 
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5 bg-black/20"
            >
                {getFilteredLogs().map((log) => (
                    <div key={log.id} className="flex gap-2 group border-b border-white/[0.02] py-0.5">
                        <span className="text-white/20 shrink-0 select-none">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className={`px-1 rounded bg-white/5 text-[9px] uppercase opacity-40 h-fit mt-0.5 shrink-0`}>
                            {log.source}
                        </span>
                        <div className={`flex-1 break-all whitespace-pre-wrap leading-relaxed ${getTypeColor(log.type)}`}>
                            {log.message}
                            {log.count > 1 && (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 text-[9px] font-bold">
                                    {log.count}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Command Input */}
            <div className="p-1.5 bg-black border-t border-white/5 flex items-center gap-2 shrink-0">
                <span className="text-blue-400 font-bold ml-1">{'>'}</span>
                <input 
                    type="text"
                    className="flex-1 bg-transparent text-white outline-none border-none placeholder:text-white/10"
                    placeholder="Enter command..."
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="text-[9px] text-text-secondary opacity-30 mr-2">
                    {activeTab === 'HISTORY' ? 'Command History' : 'Eval JS'}
                </div>
            </div>
        </div>
    );
};
