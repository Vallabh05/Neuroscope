import React from 'react';
import { Brain, ShieldAlert, HelpCircle } from 'lucide-react';

interface HeaderProps {
  onOpenAbout: () => void;
  isBackendConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAbout,
  isBackendConnected,
}) => {
  return (
    <header className="border-b border-neuro-800 bg-neuro-950/90 backdrop-blur-md sticky top-0 z-40 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand identity */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-neuro-950">
            <Brain className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-slate-100 text-base">
                NeuroScope <span className="text-cyan-400 font-extrabold">3D</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wider bg-neuro-850 text-cyan-300 border border-cyan-800/60">
                Research Prototype
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Inspect model-predicted regions, measurements, and their limits.
            </p>
          </div>
        </div>

        {/* Right controls: backend connectivity badge + help/about */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Backend Status indicator */}
          <div
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border ${
              isBackendConnected
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-400'
                : 'bg-neuro-900 border-neuro-800 text-slate-400'
            }`}
            title={isBackendConnected ? 'FastAPI backend connected' : 'FastAPI backend disconnected'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-500'
              }`}
            />
            <span className="text-[11px] font-mono">
              {isBackendConnected ? 'Backend Online' : 'Backend Offline'}
            </span>
          </div>

          {/* Help & Limitations modal toggle */}
          <button
            onClick={onOpenAbout}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-neuro-900 hover:bg-neuro-850 border border-neuro-800 hover:border-neuro-700 text-slate-300 hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-medium">About & Limitations</span>
          </button>
        </div>
      </div>

      {/* Prominent Mandatory Safety Disclaimer Ribbon */}
      <div className="bg-amber-500/10 border-t border-b border-amber-500/20 px-4 py-1 flex items-center justify-center space-x-2 text-amber-300 text-[11px] font-medium tracking-wide">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-center">
          <strong>Research and educational prototype only.</strong> AI-generated segmentation is not a diagnosis and must not be used for treatment decisions.
        </span>
      </div>
    </header>
  );
};
