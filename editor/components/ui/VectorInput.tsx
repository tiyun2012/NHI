
import React from 'react';
import { NumberInput } from './NumberInput';

interface Vector3 { x: number; y: number; z: number; }

interface VectorInputProps {
    label?: string;
    value: Vector3;
    onChange: (val: Vector3) => void;
    step?: number;
    disabled?: boolean;
}

export const VectorInput: React.FC<VectorInputProps> = ({ label, value, onChange, step, disabled }) => {
    return (
        <div className="flex flex-col gap-1 mb-2">
            {label && (
                <div className="text-[9px] uppercase text-text-secondary font-bold tracking-wider ml-1 opacity-70">
                    {label}
                </div>
            )}
            <div className="grid grid-cols-3 gap-1">
                <NumberInput 
                    label="X" value={value.x} 
                    onChange={v => onChange({ ...value, x: v })} 
                    step={step} color="text-red-500" disabled={disabled} 
                />
                <NumberInput 
                    label="Y" value={value.y} 
                    onChange={v => onChange({ ...value, y: v })} 
                    step={step} color="text-green-500" disabled={disabled} 
                />
                <NumberInput 
                    label="Z" value={value.z} 
                    onChange={v => onChange({ ...value, z: v })} 
                    step={step} color="text-blue-500" disabled={disabled} 
                />
            </div>
        </div>
    );
};
