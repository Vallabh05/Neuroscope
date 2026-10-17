import React from 'react';
import { Brain, HelpCircle, ShieldAlert } from 'lucide-react';

interface HeaderProps {
  onOpenAbout: () => void;
  isBackendConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAbout,
  isBackendConnected,
}) => {
  return (
    <header className="border-b border-[#222222] bg-[#000000] sticky top-0 z-40 select-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
        {/* Brand identity: Vercel minimalist black & white style */}
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded bg-white text-black flex items-center justify-center font-bold">
            <Brain className="w-4 h-4 text-black" strokeWidth={2.2} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold tracking-tight text-white text-sm font-sans">
                NeuroScope <span className="text-neutral-400 font-normal">3D</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[#111111] text-neutral-400 border border-[#222222]">
                Research Prototype
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 hidden sm:block font-sans">
              Volumetric MRI segmentation & geometric verification
            </p>
          </div>
        </div>

        {/* Right controls: Backend connectivity badge + About toggle */}
        <div className="flex items-center space-x-2.5 text-xs">
          {/* Backend Status indicator */}
          <div
            className="flex items-center space-x-2 px-2.5 py-1 rounded bg-[#0A0A0A] border border-[#222222] text-neutral-400"
            title={isBackendConnected ? 'FastAPI daemon connected on 127.0.0.1:8000' : 'FastAPI daemon offline'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isBackendConnected ? 'bg-emerald-400' : 'bg-red-500'
              }`}
            />
            <span className="text-[11px] font-mono">
              {isBackendConnected ? 'API Online' : 'API Offline'}
            </span>
          </div>

          {/* About & Limitations modal button */}
          <button
            type="button"
            onClick={onOpenAbout}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#0A0A0A] hover:bg-[#161616] border border-[#222222] hover:border-[#333333] text-neutral-300 hover:text-white transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[11px] font-medium font-sans">About & Specs</span>
          </button>
        </div>
      </div>

      {/* Understated Safety Disclaimer Ribbon */}
      <div className="bg-[#0A0A0A] border-t border-[#1C1C1C] px-4 py-1 flex items-center justify-center space-x-2 text-neutral-400 text-[11px] font-mono">
        <ShieldAlert className="w-3 h-3 text-neutral-400 flex-shrink-0" />
        <span className="text-center">
          <strong className="text-neutral-300">RESEARCH PROTOTYPE:</strong> Algorithmic segmentation estimates must not be used for medical diagnosis or clinical treatment.
        </span>
      </div>
    </header>
  );
};

export default Header;
