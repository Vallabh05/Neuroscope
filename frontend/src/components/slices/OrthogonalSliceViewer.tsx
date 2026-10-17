import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { CoordinatesState, RegionVolume, SegmentationResult } from '../../types';
import { voxelToWorld } from '../../utils/coordinates';
import { Crosshair, Layers } from 'lucide-react';

interface OrthogonalSliceViewerProps {
  result: SegmentationResult;
  coords: CoordinatesState;
  onCoordsChange: (coords: CoordinatesState) => void;
  regions: {
    wt: RegionVolume;
    tc: RegionVolume;
    et: RegionVolume;
    ed?: RegionVolume;
    ncr?: RegionVolume;
  };
}

type ModalityView = 't1' | 't1gd' | 't2' | 'flair';
type PlaneType = 'axial' | 'coronal' | 'sagittal';

export const OrthogonalSliceViewer: React.FC<OrthogonalSliceViewerProps> = ({
  result,
  coords,
  onCoordsChange,
  regions,
}) => {
  const [selectedModality, setSelectedModality] = useState<ModalityView>('t1gd');
  const [showOverlays, setShowOverlays] = useState(true);
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(0.55);

  const [dimX, dimY, dimZ] = result.dimensions;

  const axisLabel = (axis: number, highIndex: boolean): string => {
    const vector = result.affine.slice(0, 3).map(row => row[axis]);
    const worldAxis = vector.reduce(
      (best, value, index) => Math.abs(value) > Math.abs(vector[best]) ? index : best,
      0,
    );
    const increasingPositive = vector[worldAxis] > 0;
    const positiveEnd = ['R', 'A', 'S'][worldAxis];
    const negativeEnd = ['L', 'P', 'I'][worldAxis];
    return highIndex === increasingPositive ? positiveEnd : negativeEnd;
  };

  const axialCanvasRef = useRef<HTMLCanvasElement>(null);
  const coronalCanvasRef = useRef<HTMLCanvasElement>(null);
  const sagittalCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleCanvasClick = (
    e: React.MouseEvent<HTMLCanvasElement>,
    plane: PlaneType,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const newVoxel = [...coords.voxel] as [number, number, number];

    if (plane === 'axial') {
      newVoxel[0] = Math.max(0, Math.min(dimX - 1, Math.floor(clickX * dimX)));
      newVoxel[1] = Math.max(0, Math.min(dimY - 1, Math.floor(clickY * dimY)));
    } else if (plane === 'coronal') {
      newVoxel[0] = Math.max(0, Math.min(dimX - 1, Math.floor(clickX * dimX)));
      newVoxel[2] = Math.max(0, Math.min(dimZ - 1, Math.floor((1 - clickY) * dimZ)));
    } else if (plane === 'sagittal') {
      newVoxel[1] = Math.max(0, Math.min(dimY - 1, Math.floor(clickX * dimY)));
      newVoxel[2] = Math.max(0, Math.min(dimZ - 1, Math.floor((1 - clickY) * dimZ)));
    }

    const newWorld = voxelToWorld(newVoxel, result.affine);
    onCoordsChange({ voxel: newVoxel, world: newWorld });
  };

  const volume = result.modalities[selectedModality];
  const intensityData = volume.data as Float32Array;
  const maskData = result.mask.data as Uint8Array;
  const displayRange = volume.display_range ?? [0, 1];

  const renderSlice = useCallback((
    canvas: HTMLCanvasElement | null,
    plane: PlaneType
  ) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let sliceIdx = 0;

    if (plane === 'axial') {
      width = dimX;
      height = dimY;
      sliceIdx = coords.voxel[2]; // Z
    } else if (plane === 'coronal') {
      width = dimX;
      height = dimZ;
      sliceIdx = coords.voxel[1]; // Y
    } else {
      width = dimY;
      height = dimZ;
      sliceIdx = coords.voxel[0]; // X
    }

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        let vx = 0;
        let vy = 0;
        let vz = 0;

        if (plane === 'axial') {
          vx = px;
          vy = py;
          vz = sliceIdx;
        } else if (plane === 'coronal') {
          vx = px;
          vy = sliceIdx;
          vz = height - 1 - py;
        } else {
          vx = sliceIdx;
          vy = px;
          vz = height - 1 - py;
        }

        const voxelIndex = vx + dimX * (vy + dimY * vz);
        const intensity = intensityData[voxelIndex];
        const label = maskData[voxelIndex];
        const mri = Math.max(
          0,
          Math.min(
            255,
            Math.round(((intensity - displayRange[0]) / (displayRange[1] - displayRange[0])) * 255),
          ),
        );
        const pixelIdx = (py * width + px) * 4;

        let r = mri;
        let g = mri;
        let b = mri;

        // Apply segmentation overlays according to visibility and region settings
        // BraTS Colors: ET (label 4, Blue/Cyan), NCR (label 1, Red), ED (label 2, Amber/Yellow)
        if (showOverlays && label > 0) {
          let shouldColor = false;
          let cr = 0, cg = 0, cb = 0;

          if (label === 4 && (regions.et.visible || regions.tc.visible || regions.wt.visible)) {
            shouldColor = true;
            cr = 2; cg = 132; cb = 199; // #0284C7
          } else if (label === 1 && (regions.tc.visible || regions.wt.visible)) {
            shouldColor = true;
            cr = 220; cg = 38; cb = 38; // #DC2626
          } else if (label === 2 && regions.wt.visible) {
            shouldColor = true;
            cr = 217; cg = 119; cb = 6; // #D97706
          }

          if (shouldColor) {
            const alpha = overlayOpacity;
            r = Math.round(r * (1 - alpha) + cr * alpha);
            g = Math.round(g * (1 - alpha) + cg * alpha);
            b = Math.round(b * (1 - alpha) + cb * alpha);
          }
        }

        data[pixelIdx] = r;
        data[pixelIdx + 1] = g;
        data[pixelIdx + 2] = b;
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw Crosshairs in technical blue (#1677D2)
    if (showCrosshairs) {
      let crossX = 0;
      let crossY = 0;

      if (plane === 'axial') {
        crossX = coords.voxel[0];
        crossY = coords.voxel[1];
      } else if (plane === 'coronal') {
        crossX = coords.voxel[0];
        crossY = height - 1 - coords.voxel[2];
      } else {
        crossX = coords.voxel[1];
        crossY = height - 1 - coords.voxel[2];
      }

      ctx.strokeStyle = 'rgba(22, 119, 210, 0.85)';
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crossX + 0.5, 0);
      ctx.lineTo(crossX + 0.5, height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crossY + 0.5);
      ctx.lineTo(width, crossY + 0.5);
      ctx.stroke();

      // Small central square/circle
      ctx.beginPath();
      ctx.arc(crossX + 0.5, crossY + 0.5, 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [
    dimX,
    dimY,
    dimZ,
    coords.voxel,
    displayRange,
    intensityData,
    maskData,
    showOverlays,
    showCrosshairs,
    overlayOpacity,
    regions
  ]);

  useEffect(() => {
    renderSlice(axialCanvasRef.current, 'axial');
    renderSlice(coronalCanvasRef.current, 'coronal');
    renderSlice(sagittalCanvasRef.current, 'sagittal');
  }, [renderSlice]);

  return (
    <div className="bg-atern-surface rounded-sm border border-atern-border p-3.5 space-y-3.5 select-none font-mono">
      {/* Controls Toolbar: Utilitarian Flat Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-atern-border text-xs">
        {/* Modality Selector */}
        <div className="flex items-center space-x-1 bg-atern-bg p-0.5 rounded-sm border border-atern-border">
          <span className="text-[10px] uppercase font-bold text-atern-muted px-2">Modality:</span>
          {(['t1', 't1gd', 't2', 'flair'] as ModalityView[]).map(mod => (
            <button
              key={mod}
              type="button"
              onClick={() => setSelectedModality(mod)}
              className={`px-2 py-0.5 rounded-sm font-bold text-[11px] uppercase transition-colors cursor-pointer ${
                selectedModality === mod
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text hover:bg-atern-hover'
              }`}
            >
              {mod === 't1gd' ? 'T1Gd' : mod}
            </button>
          ))}
        </div>

        {/* Overlay & Crosshair Controls */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 bg-atern-bg px-2.5 py-1 rounded-sm border border-atern-border">
            <button
              type="button"
              onClick={() => setShowOverlays(!showOverlays)}
              className={`flex items-center space-x-1 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                showOverlays ? 'text-atern-blue' : 'text-atern-muted'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Mask</span>
            </button>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={overlayOpacity}
              disabled={!showOverlays}
              onChange={e => setOverlayOpacity(parseFloat(e.target.value))}
              className="w-14 h-1 bg-atern-surface appearance-none cursor-pointer accent-atern-blue disabled:opacity-30"
              title={`Overlay Opacity: ${Math.round(overlayOpacity * 100)}%`}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCrosshairs(!showCrosshairs)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded-sm border text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              showCrosshairs
                ? 'bg-atern-blue text-white border-atern-blue'
                : 'bg-atern-bg border-atern-border text-atern-muted hover:text-atern-text'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Crosshair</span>
          </button>
        </div>
      </div>

      {/* 3 Orthogonal Slices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. AXIAL VIEW */}
        <div className="space-y-1.5 bg-atern-bg p-2 rounded-sm border border-atern-border">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-atern-text uppercase flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-none bg-atern-blue inline-block" />
              <span>Axial (XY)</span>
            </span>
            <span className="text-atern-blue font-bold">
              Slice {coords.voxel[2] + 1}/{dimZ}
            </span>
          </div>

          <div className="relative aspect-square bg-black rounded-none overflow-hidden border border-atern-border cursor-crosshair">
            <canvas
              ref={axialCanvasRef}
              onClick={e => handleCanvasClick(e, 'axial')}
              className="w-full h-full slice-canvas block"
            />
            {/* Direction labels */}
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(1, false)}
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(1, true)}
            </span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(0, false)}
            </span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(0, true)}
            </span>
          </div>

          <div className="pt-0.5">
            <input
              type="range"
              min="0"
              max={dimZ - 1}
              value={coords.voxel[2]}
              onChange={e => {
                const z = parseInt(e.target.value);
                const newVoxel: [number, number, number] = [coords.voxel[0], coords.voxel[1], z];
                onCoordsChange({ voxel: newVoxel, world: voxelToWorld(newVoxel, result.affine) });
              }}
              className="w-full h-1 bg-atern-surface appearance-none cursor-pointer accent-atern-blue"
            />
          </div>
        </div>

        {/* 2. CORONAL VIEW */}
        <div className="space-y-1.5 bg-atern-bg p-2 rounded-sm border border-atern-border">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-atern-text uppercase flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-none bg-emerald-400 inline-block" />
              <span>Coronal (XZ)</span>
            </span>
            <span className="text-emerald-400 font-bold">
              Slice {coords.voxel[1] + 1}/{dimY}
            </span>
          </div>

          <div className="relative aspect-square bg-black rounded-none overflow-hidden border border-atern-border cursor-crosshair">
            <canvas
              ref={coronalCanvasRef}
              onClick={e => handleCanvasClick(e, 'coronal')}
              className="w-full h-full slice-canvas block"
            />
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(2, true)}
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(2, false)}
            </span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(0, false)}
            </span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(0, true)}
            </span>
          </div>

          <div className="pt-0.5">
            <input
              type="range"
              min="0"
              max={dimY - 1}
              value={coords.voxel[1]}
              onChange={e => {
                const y = parseInt(e.target.value);
                const newVoxel: [number, number, number] = [coords.voxel[0], y, coords.voxel[2]];
                onCoordsChange({ voxel: newVoxel, world: voxelToWorld(newVoxel, result.affine) });
              }}
              className="w-full h-1 bg-atern-surface appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>

        {/* 3. SAGITTAL VIEW */}
        <div className="space-y-1.5 bg-atern-bg p-2 rounded-sm border border-atern-border">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-atern-text uppercase flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-none bg-red-400 inline-block" />
              <span>Sagittal (YZ)</span>
            </span>
            <span className="text-red-400 font-bold">
              Slice {coords.voxel[0] + 1}/{dimX}
            </span>
          </div>

          <div className="relative aspect-square bg-black rounded-none overflow-hidden border border-atern-border cursor-crosshair">
            <canvas
              ref={sagittalCanvasRef}
              onClick={e => handleCanvasClick(e, 'sagittal')}
              className="w-full h-full slice-canvas block"
            />
            <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(2, true)}
            </span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(2, false)}
            </span>
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(1, false)}
            </span>
            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-atern-muted/80 pointer-events-none">
              {axisLabel(1, true)}
            </span>
          </div>

          <div className="pt-0.5">
            <input
              type="range"
              min="0"
              max={dimX - 1}
              value={coords.voxel[0]}
              onChange={e => {
                const x = parseInt(e.target.value);
                const newVoxel: [number, number, number] = [x, coords.voxel[1], coords.voxel[2]];
                onCoordsChange({ voxel: newVoxel, world: voxelToWorld(newVoxel, result.affine) });
              }}
              className="w-full h-1 bg-atern-surface appearance-none cursor-pointer accent-red-400"
            />
          </div>
        </div>
      </div>

      {/* Coordinate Telemetry Footer */}
      <div className="p-2.5 rounded-sm bg-atern-bg border border-atern-border flex flex-wrap items-center justify-between text-xs text-atern-muted">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-atern-muted uppercase">Voxel:</span>
            <span className="text-atern-text font-bold">
              [{coords.voxel[0]}, {coords.voxel[1]}, {coords.voxel[2]}]
            </span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-atern-muted uppercase">World RAS:</span>
            <span className="text-atern-blue font-bold">
              [{coords.world[0].toFixed(1)}, {coords.world[1].toFixed(1)}, {coords.world[2].toFixed(1)}] mm
            </span>
          </div>
        </div>
        <div className="text-[11px] text-atern-muted">
          Matrix: {dimX}×{dimY}×{dimZ} | Voxel Spacing: {result.voxel_spacing_mm.map(s => s.toFixed(1)).join('×')} mm
        </div>
      </div>
    </div>
  );
};
