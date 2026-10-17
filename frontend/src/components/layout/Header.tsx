import React from 'react';
import { Brain, HelpCircle, ShieldAlert } from 'lucide-react';

export type AppTab = 'home' | 'cases' | 'workstation' | 'reports';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  onOpenAbout: () => void;
  isBackendConnected: boolean;
  activeCaseId?: string | null;
  hasActiveCase?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onOpenAbout,
  isBackendConnected,
  activeCaseId,
  hasActiveCase,
}) => {
  const navItems: { id: AppTab; label: string; badge?: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'cases', label: 'Cases' },
    { id: 'workstation', label: 'Workstation', badge: hasActiveCase ? 'ACTIVE' : undefined },
    { id: 'reports', label: 'Reports' },
  ];

  return (
    <header className="border-b border-atern-border bg-atern-surface select-none sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between">
        {/* Brand identity: Raw technical minimalism */}
        <div className="flex items-center space-x-6">
          <div
            onClick={() => onTabChange('home')}
            className="flex items-center space-x-2.5 cursor-pointer group"
          >
            <div className="w-7 h-7 bg-atern-blue flex items-center justify-center rounded-sm text-white">
              <Brain className="w-4 h-4" strokeWidth={2.2} />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="font-bold tracking-tight text-atern-text text-sm font-sans uppercase">
                NeuroScope<span className="text-atern-blue">3D</span>
              </span>
              <span className="text-[10px] font-mono text-atern-muted tracking-widest hidden sm:inline">
                v2.4
              </span>
            </div>
          </div>

          {/* Utilitarian Navigation Tabs */}
          <nav className="flex items-center space-x-1" aria-label="Main Navigation">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-sm transition-colors flex items-center space-x-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-atern-blue text-white'
                      : 'text-atern-muted hover:text-atern-text hover:bg-atern-hover'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`text-[9px] font-mono px-1 py-0.2 rounded-none ${
                        isActive
                          ? 'bg-atern-surface text-atern-text'
                          : 'bg-atern-blue/20 text-[#64B5F6]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right side: Active Case ID badge, Backend status indicator, About button */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Active Case indicator */}
          {hasActiveCase && activeCaseId && (
            <div
              className="hidden lg:flex items-center space-x-1.5 px-2 py-1 bg-atern-bg border border-atern-border rounded-sm font-mono text-[11px] text-atern-muted"
              title={`Active case: ${activeCaseId}`}
            >
              <span className="text-atern-text">CASE:</span>
              <span className="text-atern-blue truncate max-w-[140px]">{activeCaseId}</span>
            </div>
          )}

          {/* Backend Status indicator */}
          <div
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm border border-atern-border bg-atern-bg"
            title={
              isBackendConnected
                ? 'FastAPI backend connected on 127.0.0.1:8000'
                : 'FastAPI backend disconnected'
            }
          >
            <span
              className={`w-2 h-2 rounded-none ${
                isBackendConnected ? 'bg-emerald-400' : 'bg-red-500'
              }`}
            />
            <span className="text-[11px] font-mono font-medium text-atern-muted">
              {isBackendConnected ? 'API ONLINE' : 'API OFFLINE'}
            </span>
          </div>

          {/* About & Limitations Modal */}
          <button
            type="button"
            onClick={onOpenAbout}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-sm bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-muted hover:text-atern-text text-xs transition-colors cursor-pointer"
            title="Scientific limitations and clinical safety info"
          >
            <HelpCircle className="w-3.5 h-3.5 text-atern-blue" />
            <span className="text-[11px] font-mono hidden sm:inline">ABOUT</span>
          </button>
        </div>
      </div>

      {/* Utilitarian Safety Ribbon */}
      <div className="bg-atern-bg border-t border-atern-border px-4 py-1 flex items-center justify-center space-x-2 text-atern-muted text-[11px] font-mono">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-center">
          <strong className="text-atern-text">RESEARCH PROTOTYPE:</strong> AI-generated segmentation is an algorithmic estimate and must not be used for medical diagnosis or clinical treatment.
        </span>
      </div>
    </header>
  );
};
