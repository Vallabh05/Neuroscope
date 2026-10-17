import React, { useState } from 'react';
import type { CoordinatesState, SegmentationResult } from '../types';
import { ThreeBrainViewer } from '../components/viewer/ThreeBrainViewer';
import { OrthogonalSliceViewer } from '../components/slices/OrthogonalSliceViewer';
import { MeasurementsPanel } from '../components/measurements/MeasurementsPanel';
import { VerificationPanel } from '../components/verification/VerificationPanel';
import { ExportActions } from '../components/export/ExportActions';
import { voxelToWorld } from '../utils/coordinates';

interface ResultsPageProps {
  result: SegmentationResult;
  onStartNewCase: () => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  result,
  onStartNewCase,
}) => {
  // Synchronized Coordinate state across 3D view and all 3 orthogonal slice views
  const [coords, setCoords] = useState<CoordinatesState>(() => {
    const initVoxel: [number, number, number] = result.dimensions.map(
      size => Math.floor((size - 1) / 2),
    ) as [number, number, number];
    return {
      voxel: initVoxel,
      world: voxelToWorld(initVoxel, result.affine)
    };
  });

  // Region controls (WT, TC, ET)
  const [regions, setRegions] = useState(result.volumes);

  // Active view layout tab for desktop / mobile:
  // 'both' (split view: 3D + 2D Slices), '3d' (only 3D), 'slices' (only 2D slices)
  const [viewMode, setViewMode] = useState<'both' | '3d' | 'slices'>('both');

  const handleToggleRegion = (id: 'wt' | 'tc' | 'et') => {
    setRegions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        visible: !prev[id].visible
      }
    }));
  };

  const handleChangeOpacity = (id: 'wt' | 'tc' | 'et', opacity: number) => {
    setRegions(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        opacity
      }
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-6 animate-fade-in">
      {/* Main View Mode Selector */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center space-x-2 text-xs text-slate-300">
          <span className="font-semibold text-white">Visualisation Mode:</span>
          <div className="flex items-center space-x-1 bg-neuro-900 p-1 rounded-xl border border-neuro-800">
            <button
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'both' ? 'bg-cyan-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Interactive Split (3D + 2D Slices)
            </button>
            <button
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === '3d' ? 'bg-cyan-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              3D Surface Only
            </button>
            <button
              onClick={() => setViewMode('slices')}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'slices' ? 'bg-cyan-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Orthogonal Slices Only
            </button>
          </div>
        </div>

        {/* Co-registered coordinate indicator */}
        <div className="hidden md:flex items-center space-x-3 text-xs font-mono bg-neuro-900/80 px-3 py-1.5 rounded-xl border border-neuro-800">
          <span className="text-slate-400">Position:</span>
          <span className="text-cyan-300">Voxel [{coords.voxel.join(', ')}]</span>
          <span className="text-cyan-300">World [{coords.world.map(value => value.toFixed(1)).join(', ')}] mm</span>
        </div>
      </div>

      {/* Primary Visualisation Region */}
      <div className="space-y-6">
        {viewMode === 'both' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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

            {/* Linked 2D Slices: 7 cols */}
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
          <div className="h-[650px] w-full">
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
