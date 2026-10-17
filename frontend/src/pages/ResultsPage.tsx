import React, { useState } from 'react';
import type { CoordinatesState, SegmentationResult } from '../types';
import { ThreeBrainViewer } from '../components/viewer/ThreeBrainViewer';
import { OrthogonalSliceViewer } from '../components/slices/OrthogonalSliceViewer';
import { MeasurementsPanel } from '../components/measurements/MeasurementsPanel';
import { VerificationPanel } from '../components/verification/VerificationPanel';
import { ExportActions } from '../components/export/ExportActions';
import { voxelToWorld } from '../utils/coordinates';
import { ArrowRight, Box, Layers, Maximize2 } from 'lucide-react';

interface ResultsPageProps {
  result: SegmentationResult | null;
  onStartNewCase: () => void;
  onOpenCases?: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  result,
  onStartNewCase,
  onOpenCases,
}) => {
  if (!result) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6">
        <div className="border border-atern-border bg-atern-surface p-8 text-center space-y-4 rounded-sm font-mono">
          <div className="w-10 h-10 mx-auto rounded-none bg-atern-bg border border-atern-border flex items-center justify-center text-atern-muted">
            <Layers className="w-5 h-5 text-atern-blue" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold uppercase tracking-wider text-atern-text">
              No Study Active in Workstation
            </h2>
            <p className="text-xs text-atern-muted max-w-md mx-auto leading-relaxed">
              The medical imaging workstation requires a segmented 4-modality brain MRI series. Select or upload sequences in the Cases tab to begin analysis.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onOpenCases}
              className="px-5 py-2.5 bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider rounded-sm inline-flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Open Cases & Ingest Sequences</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Synchronized Coordinate state across 3D view and all 3 orthogonal slice views
  const [coords, setCoords] = useState<CoordinatesState>(() => {
    const initVoxel: [number, number, number] = result.dimensions.map(
      size => Math.floor((size - 1) / 2),
    ) as [number, number, number];
    return {
      voxel: initVoxel,
      world: voxelToWorld(initVoxel, result.affine),
    };
  });

  // Region controls (WT, TC, ET)
  const [regions, setRegions] = useState(result.volumes);

  // Active view layout mode: 'both' | '3d' | 'slices'
  const [viewMode, setViewMode] = useState<'both' | '3d' | 'slices'>('both');

  const handleToggleRegion = (id: 'wt' | 'tc' | 'et') => {
    setRegions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        visible: !prev[id].visible,
      },
    }));
  };

  const handleChangeOpacity = (id: 'wt' | 'tc' | 'et', opacity: number) => {
    setRegions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        opacity,
      },
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-5 animate-fade-in font-mono">
      {/* Top Workstation Control Bar: Viewport Switcher & Synchronized Coordinates */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-atern-muted text-[11px]">
            Viewport:
          </span>
          <div className="flex items-center space-x-1 bg-atern-surface p-0.5 rounded-sm border border-atern-border">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer ${
                viewMode === 'both'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text hover:bg-atern-hover'
              }`}
            >
              Split (3D + 2D)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text hover:bg-atern-hover'
              }`}
            >
              3D Surface
            </button>
            <button
              type="button"
              onClick={() => setViewMode('slices')}
              className={`px-3 py-1 rounded-sm text-xs uppercase font-bold tracking-wider transition-colors cursor-pointer ${
                viewMode === 'slices'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text hover:bg-atern-hover'
              }`}
            >
              2D Slices
            </button>
          </div>
        </div>

        {/* Global Position Indicator */}
        <div className="flex items-center space-x-3 text-xs bg-atern-surface px-3 py-1 rounded-sm border border-atern-border">
          <span className="text-atern-muted uppercase">Coord:</span>
          <span className="text-atern-text font-bold">
            Voxel [{coords.voxel.join(', ')}]
          </span>
          <span className="text-atern-blue font-bold">
            World [{coords.world.map(v => v.toFixed(1)).join(', ')}] mm
          </span>
        </div>
      </div>

      {/* Primary Visualisation Layout */}
      <div>
        {viewMode === 'both' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 3D Brain Viewer: 5 cols */}
            <div className="lg:col-span-5 h-[540px]">
              <ThreeBrainViewer
                result={result}
                activeWorldPos={coords.world}
                regions={regions}
                onToggleRegion={handleToggleRegion}
                onChangeOpacity={handleChangeOpacity}
              />
            </div>

            {/* Linked 2D Orthogonal Slices: 7 cols */}
            <div className="lg:col-span-7">
              <OrthogonalSliceViewer
                result={result}
                coords={coords}
                onCoordsChange={setCoords}
                regions={regions}
              />
            </div>
          </div>
        ) : viewMode === '3d' ? (
          <div className="h-[640px] w-full">
            <ThreeBrainViewer
              result={result}
              activeWorldPos={coords.world}
              regions={regions}
              onToggleRegion={handleToggleRegion}
              onChangeOpacity={handleChangeOpacity}
            />
          </div>
        ) : (
          <div className="w-full">
            <OrthogonalSliceViewer
              result={result}
              coords={coords}
              onCoordsChange={setCoords}
              regions={regions}
            />
          </div>
        )}
      </div>

      {/* Volumetric Measurements Panel */}
      <MeasurementsPanel
        result={result}
        coords={coords}
        onCoordsChange={setCoords}
        regions={regions}
        onToggleRegion={handleToggleRegion}
        onChangeOpacity={handleChangeOpacity}
      />

      {/* Verification & Limitations Trust Audit Panel */}
      <VerificationPanel result={result} />

      {/* Export Actions (Download mask, report, new case) */}
      <ExportActions
        result={result}
        onStartNewCase={onStartNewCase}
      />
    </div>
  );
};
