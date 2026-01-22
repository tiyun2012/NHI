
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { consoleService, LogEntry, LogType } from '@/engine/Console';
import { useEngineAPI } from '@/engine/api/EngineProvider';
import { engineInstance } from '@/engine/engine';

export const ConsolePanel: React.FC = () => {
    const api = useEngineAPI();
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logFilter, setLogFilter] = useState<'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'CMD'>('ALL');
    const [logSearch, setLogSearch] = useState('');
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Command Input State
    const [command, setCommand] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const filteredLogs = logs.filter(l => {
        if (logFilter === 'ERROR' && l.type !== 'error') return false;
        if (logFilter === 'WARN' && l.type !== 'warn') return false;
        if (logFilter === 'CMD' && l.type !== 'command') return false;
        if (logFilter === 'INFO' && (l.type === 'error' || l.type === 'warn' || l.type === 'command')) return false;
        if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
        return true;
    });

    useEffect(() => {
        const unsubscribe = consoleService.subscribe(() => {
            setLogs([...consoleService.getLogs()]);
        });
        setLogs([...consoleService.getLogs()]);
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, logFilter]);

    const executeCommand = () => {
        if (!command.trim()) return;
        const cmd = command.trim();

        // 1. Log Command
        consoleService.cmd(cmd);

        // 2. Update History
        setHistory(prev => {
            // Prevent duplicate adjacent entries
            if (prev.length > 0 && prev[prev.length - 1] === cmd) return prev;
            return [...prev, cmd];
        });
        setHistoryIndex(-1);
        setCommand('');

        // 3. Execute
        try {
            // We create a function wrapper to inject 'api' and 'engine' into the scope
            // eslint-disable-next-line no-new-func
            const run = new Function('api', 'engine', `return (function() { return eval(${JSON.stringify(cmd)}); })()`);
            
            const result = run(api, engineInstance);
            
            if (result !== undefined) {
                let output = String(result);
                if (typeof result === 'object' && result !== null) {
                    try {
                        // Attempt to show something more useful than [object Object]
                        if (Array.isArray(result)) {
                            output = `Array(${result.length})`;
                        } else {
                            const keys = Object.keys(result);
                            output = keys.length > 0 ? `{ ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''} }` : '{}';
                            // If it has a custom toString, use it (e.g. Vector3)
                            if (result.toString !== Object.prototype.toString) output = result.toString();
                        }
                    } catch (e) { /* ignore serialization errors */ }
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

    const renderLogIcon = (type: LogType) => {
        switch(type) {
            case 'error': return <Icon name="AlertCircle" size={14} className="text-red-500" />;
            case 'warn': return <Icon name="AlertTriangle" size={14} className="text-yellow-500" />;
            case 'success': return <Icon name="CheckCircle2" size={14} className="text-green-500" />;
            case 'command': return <Icon name="ChevronRight" size={14} className="text-cyan-400" />;
            default: return <Icon name="Info" size={14} className="text-blue-400" />;
        }
    };

    const getLogColor = (type: LogType) => {
        switch(type) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-yellow-400';
            case 'success': return 'text-emerald-400';
            case 'command': return 'text-cyan-400 font-mono';
            default: return 'text-text-primary';
        }
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans border-t border-black/20">
            {/* Toolbar */}
            <div className="flex items-center justify-between bg-panel-header px-2 py-1 border-b border-black/20 h-9 shrink-0">
                <div className="flex gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-mono opacity-70 ml-2">
                        {logs.filter(l => l.type === 'error').length > 0 && (
                            <span className="text-red-400 flex items-center gap-1"><Icon name="AlertCircle" size={10} /> {logs.filter(l => l.type === 'error').length}</span>
                        )}
                        {logs.filter(l => l.type === 'warn').length > 0 && (
                            <span className="text-yellow-400 flex items-center gap-1"><Icon name="AlertTriangle" size={10} /> {logs.filter(l => l.type === 'warn').length}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-black/40 rounded p-0.5 border border-white/5">
                        <button onClick={() => setLogFilter('ALL')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'ALL' ? 'bg-white/20 text-white' : 'text-text-secondary hover:text-white'}`}>All</button>
                        <button onClick={() => setLogFilter('CMD')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'CMD' ? 'bg-cyan-500/20 text-cyan-400' : 'text-text-secondary hover:text-white'}`}>Cmds</button>
                        <button onClick={() => setLogFilter('ERROR')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'text-text-secondary hover:text-white'}`}>Errors</button>
                        <button onClick={() => setLogFilter('WARN')} className={`px-2 py-0.5 text-[10px] rounded transition-colors ${logFilter === 'WARN' ? 'bg-yellow-500/20 text-yellow-400' : 'text-text-secondary hover:text-white'}`}>Warnings</button>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filter..."
                            className="bg-input-bg text-[10px] py-1 px-2 rounded border border-transparent focus:border-accent text-white w-24 outline-none transition-all focus:w-32"
                            value={logSearch}
                            onChange={(e) => setLogSearch(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={() => consoleService.clear()}
                        className="text-xs px-2 py-1 hover:bg-white/10 rounded text-text-secondary hover:text-white border border-white/5 transition-colors"
                        title="Clear Console"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Logs List */}
            <div className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a] custom-scrollbar">
                <div className="font-mono text-xs space-y-0.5 pb-2">
                    {filteredLogs.length === 0 && <div className="text-text-secondary italic p-2 opacity-50 text-[10px]">No logs to display.</div>}
                    {filteredLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-2 py-1 px-2 hover:bg-white/5 border-b border-white/5 group transition-colors">
                            <div className="mt-0.5 shrink-0 opacity-70">
                                {renderLogIcon(log.type)}
                            </div>
                            <div className="flex-1 break-all">
                                <span className="text-[10px] text-white/30 mr-2 select-none">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                {log.source && <span className="text-[10px] text-white/50 mr-2 uppercase font-bold tracking-wider select-none">[{log.source}]</span>}
                                <span className={getLogColor(log.type)}>
                                    {log.message}
                                </span>
                                {log.count > 1 && (
                                    <span className="ml-2 bg-white/10 text-white px-1.5 rounded-full text-[9px] font-bold select-none">{log.count}</span>
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* Command Input */}
            <div className="p-2 bg-panel-header border-t border-white/5 shrink-0">
                <div className="flex items-center gap-2 bg-black/40 rounded px-2 py-1 border border-white/10 focus-within:border-accent transition-colors shadow-inner">
                    <Icon name="ChevronRight" size={14} className="text-accent shrink-0" />
                    <input 
                        className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-white placeholder:text-white/20 h-6"
                        placeholder="Enter Javascript... (Use 'api' or 'engine')"
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoComplete="off"
                    />
                </div>
            </div>
        </div>
    );
};
