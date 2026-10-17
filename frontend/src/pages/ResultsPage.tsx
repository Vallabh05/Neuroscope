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
      world: voxelToWorld(initVoxel, result.affine),
    };
  });

  // Region controls (WT, TC, ET)
  const [regions, setRegions] = useState(result.volumes);

  // Active view layout tab: 'both' | '3d' | 'slices'
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
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-5 animate-fade-in font-sans">
      {/* Vercel-style Clean Viewport Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-1 gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="font-medium text-neutral-400 font-sans">Viewport:</span>
          <div className="flex items-center space-x-0.5 bg-[#0A0A0A] p-0.5 rounded border border-[#222222]">
            <button
              type="button"
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'both'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Split (3D + 2D)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              3D Surface
            </button>
            <button
              type="button"
              onClick={() => setViewMode('slices')}
              className={`px-3 py-1 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'slices'
                  ? 'bg-[#222222] text-white font-medium'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Orthogonal Slices
            </button>
          </div>
        </div>

        {/* Global Position Indicator */}
        <div className="flex items-center space-x-3 text-xs font-mono bg-[#0A0A0A] px-3 py-1 rounded border border-[#222222]">
          <span className="text-neutral-500">Position:</span>
          <span className="text-white font-medium">Voxel [{coords.voxel.join(', ')}]</span>
          <span className="text-neutral-300">World [{coords.world.map(v => v.toFixed(1)).join(', ')}] mm</span>
        </div>
      </div>

      {/* Primary Visualisation Region */}
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

      {/* Verification & Trust Audit Panel */}
      <VerificationPanel result={result} />

      {/* Export Actions (PDF, CSV, NIfTI, JSON) */}
      <ExportActions
        result={result}
        onStartNewCase={onStartNewCase}
      />
    </div>
  );
};

export default ResultsPage;
