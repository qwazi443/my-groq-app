'use client';

import React, { useEffect, useRef, useState } from 'react';

interface LevelMeterProps {
  isActive: boolean;
  analyser: AnalyserNode | null;
}

export const LevelMeter: React.FC<LevelMeterProps> = ({ isActive, analyser }) => {
  const [level, setLevel] = useState(0);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    const updateMeter = () => {
      if (analyser && isActive) {
        // 1. Pull real-time audio data
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);

        // 2. Calculate average volume level
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        // 3. Normalize for UI (0-100 scale)
        setLevel(Math.min(100, (average / 128) * 100));
      } else {
        // Fall off slowly when stopped
        setLevel(prev => Math.max(0, prev - 2));
      }
      requestRef.current = requestAnimationFrame(updateMeter);
    };

    requestRef.current = requestAnimationFrame(updateMeter);
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [analyser, isActive]);

  const segments = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-1 h-64 w-8 bg-black/20 p-1 rounded-md border border-white/5 shadow-inner">
      {segments.reverse().map((s) => {
        const threshold = (s / 12) * 100;
        const isOn = level > threshold;
        
        let colorClass = "bg-slate-800";
        if (isOn) {
          if (s < 7) colorClass = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]";
          else if (s < 10) colorClass = "bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.6)]";
          else colorClass = "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]";
        }

        return (
          <div 
            key={s} 
            className={`flex-1 w-full rounded-sm transition-all duration-75 ${colorClass}`}
          />
        );
      })}
    </div>
  );
};