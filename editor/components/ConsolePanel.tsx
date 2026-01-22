
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
            if (hideNoise && l.type === 'command') {
                if (NOISY_PATTERNS.some(p => l.message.includes(p))) return false;
            }
            
            return true;
        });
    };

    const filteredLogs = getFilteredLogs();

    const executeCommand = () => {
        if (!command.trim()) return;
        const cmd = command.trim();

        // 1. Log Command
        consoleService.cmd(cmd);

        // 2. Update History
        setHistory(prev => {
            if (prev.length > 0 && prev[prev.length - 1] === cmd) return prev;
            return [...prev, cmd];
        });
        setHistoryIndex(-1);
        setCommand('');

        // 3. Execute
        try {
            // Inject 'api' and 'engine' for cheat-like access
            // eslint-disable-next-line no-new-func
            const run = new Function('api', 'engine', `return (function() { return eval(${JSON.stringify(cmd)}); })()`);
            
            const result = run(api, engineInstance);
            
            if (result !== undefined) {
                let output = String(result);
                if (typeof result === 'object' && result !== null) {
                    try {
                        if (Array.isArray(result)) {
                            output = `Array(${result.length})`;
                        } else {
                            // Try formatting for nicer reading
                            const keys = Object.keys(result);
                            output = keys.length > 0 
                                ? `{ ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''} }`
                                : '{}';
                            if (result.toString !== Object.prototype.toString) output = result.toString();
                        }
                    } catch (e) { /* ignore */ }
                }
                consoleService.info(output, 'Result');
            }
        } catch (e: any) {
            consoleService.error(e.message || String(e), 'Execution Error');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length === 0) return;
            const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(newIndex);
            setCommand(history[newIndex]);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex === -1) return;
            if (historyIndex === history.length - 1) {
                setHistoryIndex(-1);
                setCommand('');
            } else {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setCommand(history[newIndex]);
            }
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    };

    const renderLogIcon = (type: LogType) => {
        switch(type) {
            case 'error': return <Icon name="AlertCircle" size={14} className="text-red-500" />;
            case 'warn': return <Icon name="AlertTriangle" size={14} className="text-yellow-500" />;
            case 'success': return <Icon name="CheckCircle2" size={14} className="text-green-500" />;
            case 'command': return <Icon name="ChevronRight" size={14} className="text-cyan-400" />;
            default: return <Icon name="Info" size={14} className="text-blue-400" />;
        }
    };

    const getLogColor = (log: LogEntry) => {
        if (log.source === 'Result') return 'text-text-secondary italic';
        switch(log.type) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-yellow-400';
            case 'success': return 'text-emerald-400';
            case 'command': return 'text-cyan-400 font-bold';
            default: return 'text-text-primary';
        }
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans border-t border-black/20">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between bg-panel-header px-2 border-b border-black/20 h-9 shrink-0">
                <div className="flex gap-1 h-full pt-1">
                    <button 
                        onClick={() => { setActiveTab('LOGS'); setAutoScroll(true); }}
                        className={`px-3 flex items-center gap-2 text-[10px] font-bold rounded-t transition-colors ${activeTab === 'LOGS' ? 'bg-[#1a1a1a] text-white border-t border-x border-white/5' : 'text-text-secondary hover:text-white'}`}
                    >
                        <Icon name="List" size={12} /> All Logs
                    </button>
                    <button 
                        onClick={() => { setActiveTab('HISTORY'); setAutoScroll(true); }}
                        className={`px-3 flex items-center gap-2 text-[10px] font-bold rounded-t transition-colors ${activeTab === 'HISTORY' ? 'bg-[#1a1a1a] text-white border-t border-x border-white/5' : 'text-text-secondary hover:text-white'}`}
                    >
                        <Icon name="Terminal" size={12} /> Command History
                    </button>
                </div>
                
                <div className="flex items-center gap-2 text-[10px]">
                    <button 
                        onClick={() => consoleService.clear()}
                        className="px-2 py-1 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-colors flex items-center gap-1"
                        title="Clear Console"
                    >
                        <Icon name="Trash2" size={12} /> Clear
                    </button>
                </div>
            </div>

            {/* Filters (Visible only in LOGS tab) */}
            {activeTab === 'LOGS' && (
                <div className="flex items-center gap-2 px-2 py-1 bg-[#151515] border-b border-white/5">
                    <button 
                        onClick={() => setFilterError(!filterError)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${filterError ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-transparent border-transparent text-text-secondary opacity-50'}`}
                    >
                        <Icon name="AlertCircle" size={10} /> Errors
                    </button>
                    <button 
                        onClick={() => setFilterWarn(!filterWarn)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${filterWarn ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' : 'bg-transparent border-transparent text-text-secondary opacity-50'}`}
                    >
                        <Icon name="AlertTriangle" size={10} /> Warnings
                    </button>
                    <button 
                        onClick={() => setFilterInfo(!filterInfo)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${filterInfo ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-transparent border-transparent text-text-secondary opacity-50'}`}
                    >
                        <Icon name="Info" size={10} /> Info
                    </button>
                    
                    <div className="h-4 w-px bg-white/10 mx-1"></div>
                    
                    <button 
                        onClick={() => setHideNoise(!hideNoise)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${hideNoise ? 'bg-white/10 text-white border-white/20' : 'text-text-secondary border-transparent opacity-50'}`}
                        title="Hide noisy API calls like setFocusedWidget"
                    >
                        <Icon name="Filter" size={10} /> Hide Noise
                    </button>

                    {!autoScroll && (
                        <button 
                            onClick={() => setAutoScroll(true)}
                            className="ml-auto px-2 py-0.5 rounded text-[9px] bg-accent text-white flex items-center gap-1 animate-pulse"
                        >
                            <Icon name="ArrowDown" size={10} /> Resume Scroll
                        </button>
                    )}
                </div>
            )}

            {/* Logs List */}
            <div 
                ref={listRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a] custom-scrollbar select-text font-mono text-xs"
            >
                {filteredLogs.length === 0 && <div className="text-text-secondary italic p-4 text-center opacity-30">No logs to display</div>}
                
                {filteredLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 py-1 px-1 hover:bg-white/5 border-b border-white/5 group relative break-all">
                        <div className="mt-0.5 shrink-0 opacity-70">
                            {renderLogIcon(log.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="text-[9px] text-white/20 mr-2 select-none font-sans">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            {log.source && <span className="text-[9px] text-white/40 mr-2 uppercase font-bold tracking-wider select-none font-sans">[{log.source}]</span>}
                            <span className={getLogColor(log)}>{log.message}</span>
                            {log.count > 1 && (
                                <span className="ml-2 bg-white/20 text-white px-1.5 rounded-full text-[9px] font-bold select-none">{log.count}</span>
                            )}
                        </div>
                        <button 
                            onClick={() => copyToClipboard(log.message)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-text-secondary hover:text-white transition-opacity absolute right-2 top-0"
                            title="Copy"
                        >
                            <Icon name="Copy" size={12} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Command Input */}
            <div className="p-2 bg-panel-header border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2 bg-black/40 rounded px-2 py-1 border border-white/10 focus-within:border-accent transition-colors shadow-inner">
                    <Icon name="ChevronRight" size={14} className="text-accent shrink-0" />
                    <input 
                        className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-white placeholder:text-white/20 h-6"
                        placeholder="Enter JS... (Use 'api' or 'engine' or 'ti3d')"
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>
                <div className="text-[9px] text-text-secondary mt-1 px-1 flex justify-between">
                    <span>Use <code className="text-white">api.commands.*</code> or <code className="text-white">engine.*</code></span>
                    <span>Up/Down for History</span>
                </div>
            </div>
        </div>
    );
};
