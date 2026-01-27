
import React from 'react';
import { WindowManager } from '@/editor/components/WindowManager';
import { EditorBoot } from './EditorBoot';
import { EditorStateProvider } from './EditorStateProvider';
import { EditorLayout } from './EditorLayout';
import { EditorShortcuts } from './EditorShortcuts';

const App: React.FC = () => {
    return (
        <EditorBoot>
            <EditorStateProvider>
                <WindowManager>
                    <EditorShortcuts />
                    <EditorLayout />
                </WindowManager>
            </EditorStateProvider>
        </EditorBoot>
    );
};

export default App;
