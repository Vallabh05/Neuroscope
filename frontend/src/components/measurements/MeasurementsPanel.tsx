import React, { useMemo, useState } from 'react';
import type { CoordinatesState, RegionVolume, SegmentationResult } from '../../types';
import { voxelToWorld } from '../../utils/coordinates';
import { calculateTumorAnalytics } from '../../utils/tumorAnalytics';
import { generatePdfReport, generateCsvReport } from '../../utils/reportGenerators';
import {
  Activity,
  BarChart3,
  Box,
  Check,
  Compass,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Flame,
  Info,
  Ruler,
  Sliders,
} from 'lucide-react';

export interface MeasurementsPanelProps {
  result: SegmentationResult;
  coords?: CoordinatesState;
  onCoordsChange?: (coords: CoordinatesState) => void;
  regions?: Record<'wt' | 'tc' | 'et', RegionVolume>;
  onToggleRegion?: (id: 'wt' | 'tc' | 'et') => void;
  onChangeOpacity?: (id: 'wt' | 'tc' | 'et', opacity: number) => void;
}

type UnitMode = 'ml' | 'mm3' | 'percent';
type ProfileOrientation = 'axial' | 'coronal' | 'sagittal';

export const MeasurementsPanel: React.FC<MeasurementsPanelProps> = ({
  result,
  coords,
  onCoordsChange,
  regions,
  onToggleRegion,
  onChangeOpacity,
}) => {
  const [unitMode, setUnitMode] = useState<UnitMode>('ml');
  const [profileOrientation, setProfileOrientation] = useState<ProfileOrientation>('axial');
  const [copied, setCopied] = useState(false);

  const [dimX, dimY, dimZ] = result.dimensions;
  const analytics = useMemo(() => calculateTumorAnalytics(result), [result]);

  const jumpTo = (voxel: [number, number, number]) => {
    if (!onCoordsChange) return;
    const clamped: [number, number, number] = [
      Math.max(0, Math.min(dimX - 1, voxel[0])),
      Math.max(0, Math.min(dimY - 1, voxel[1])),
      Math.max(0, Math.min(dimZ - 1, voxel[2])),
    ];
    onCoordsChange({
      voxel: clamped,
      world: voxelToWorld(clamped, result.affine),
    });
  };

  const jumpToSliceIndex = (axis: 0 | 1 | 2, sliceIdx: number) => {
    if (!coords || !onCoordsChange) return;
    const newVoxel = [...coords.voxel] as [number, number, number];
    newVoxel[axis] = sliceIdx;
    onCoordsChange({
      voxel: newVoxel,
      world: voxelToWorld(newVoxel, result.affine),
    });
  };

  const formatValue = (ml: number, mm3: number, baseMl = analytics.volumes.wt.ml): string => {
    if (unitMode === 'ml') {
      return `${ml.toFixed(2)} mL`;
    }
    if (unitMode === 'mm3') {
      return `${Math.round(mm3).toLocaleString()} mm³`;
    }
    const pct = baseMl > 0 ? (ml / baseMl) * 100 : 0;
    return `${pct.toFixed(1)}% WT`;
  };

  const handleCopyReport = () => {
    const lines = [
      `NeuroScope 3D - Tumour Volumetric Report`,
      `Case ID: ${result.case_id}`,
      `Generated: ${result.created_at}`,
      `Model: ${result.model_identifier} (${result.model_device})`,
      `Voxel Size: ${result.voxel_spacing_mm.map(s => s.toFixed(1)).join('x')} mm (${analytics.voxelVolumeMm3.toFixed(3)} mm3/voxel)`,
      ``,
      `--- COMPOSITE REGIONS (BraTS Definitions) ---`,
      `Whole Tumour (WT, labels 1+2+4): ${analytics.volumes.wt.ml.toFixed(2)} mL (${analytics.volumes.wt.count.toLocaleString()} voxels)`,
      `Tumour Core (TC, labels 1+4): ${analytics.volumes.tc.ml.toFixed(2)} mL (${analytics.volumes.tc.count.toLocaleString()} voxels)`,
      `Enhancing Tumour (ET, label 4): ${analytics.volumes.et.ml.toFixed(2)} mL (${analytics.volumes.et.count.toLocaleString()} voxels)`,
      ``,
      `--- EXCLUSIVE SUB-COMPARTMENTS ---`,
      `Active Enhancing (ET): ${analytics.volumes.et.ml.toFixed(2)} mL (${analytics.ratios.enhancingFraction.toFixed(1)}% of TC)`,
      `Necrotic/Non-enhancing Core (NCR): ${analytics.volumes.ncr.ml.toFixed(2)} mL (${analytics.ratios.necroticFraction.toFixed(1)}% of TC)`,
      `Peritumoral Edema (ED): ${analytics.volumes.edema.ml.toFixed(2)} mL (${analytics.ratios.edemaFraction.toFixed(1)}% of WT)`,
      ``,
      `--- MORPHOMETRY & LESION BOUNDS ---`,
      `Lesion Centroid: Voxel [${analytics.centroids.wt.voxel.join(', ')}] | World [${analytics.centroids.wt.world.map(v => v.toFixed(1)).join(', ')}] mm`,
      analytics.bbox
        ? `Bounding Box Extent: ${analytics.bbox.sizeMm[0].toFixed(1)} x ${analytics.bbox.sizeMm[1].toFixed(1)} x ${analytics.bbox.sizeMm[2].toFixed(1)} mm`
        : 'Bounding Box: None',
      `Max Estimated 3D Caliper: ${analytics.maxDiameter3dMm.toFixed(1)} mm`,
      `Max Axial Caliper: ${analytics.maxAxialDiameterMm.toFixed(1)} mm`,
      `Peak Axial Slice: Z=${analytics.profiles.peaks.axial.slice} (${analytics.profiles.peaks.axial.count.toLocaleString()} voxels)`,
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeRegions = regions ?? result.volumes;

  const displayList = [
    {
      id: 'wt' as const,
      region: activeRegions.wt,
      borderClass: 'border-[#D97706]/60',
      badgeClass: 'bg-[#D97706] text-black',
      textColor: 'text-[#D97706]',
      tag: 'Labels 1 + 2 + 4',
      volumeMl: analytics.volumes.wt.ml,
      volumeMm3: analytics.volumes.wt.mm3,
      voxelCount: analytics.volumes.wt.count,
      centroid: analytics.centroids.wt,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Entire hyperintense lesion: edema, necrosis, and active tissue.',
    },
    {
      id: 'tc' as const,
      region: activeRegions.tc,
      borderClass: 'border-[#DC2626]/60',
      badgeClass: 'bg-[#DC2626] text-white',
      textColor: 'text-[#DC2626]',
      tag: 'Labels 1 + 4',
      volumeMl: analytics.volumes.tc.ml,
      volumeMm3: analytics.volumes.tc.mm3,
      voxelCount: analytics.volumes.tc.count,
      centroid: analytics.centroids.tc,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Resectable pathological target: angiogenic tissue + necrosis.',
    },
    {
      id: 'et' as const,
      region: activeRegions.et,
      borderClass: 'border-[#0284C7]/60',
      badgeClass: 'bg-[#0284C7] text-white',
      textColor: 'text-[#0284C7]',
      tag: 'Label 4 only',
      volumeMl: analytics.volumes.et.ml,
      volumeMm3: analytics.volumes.et.mm3,
      voxelCount: analytics.volumes.et.count,
      centroid: analytics.centroids.et,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Vascularized viable tumor on post-gadolinium T1Gd.',
    },
  ];

  const currentProfileData = useMemo(() => {
    if (profileOrientation === 'axial') {
      return {
        counts: analytics.profiles.axial,
        length: dimZ,
        peak: analytics.profiles.peaks.axial,
        current: coords?.voxel[2] ?? Math.floor(dimZ / 2),
        axis: 2 as const,
        label: 'Axial (Z) Slice Burden',
      };
    }
    if (profileOrientation === 'coronal') {
      return {
        counts: analytics.profiles.coronal,
        length: dimY,
        peak: analytics.profiles.peaks.coronal,
        current: coords?.voxel[1] ?? Math.floor(dimY / 2),
        axis: 1 as const,
        label: 'Coronal (Y) Slice Burden',
      };
    }
    return {
      counts: analytics.profiles.sagittal,
      length: dimX,
      peak: analytics.profiles.peaks.sagittal,
      current: coords?.voxel[0] ?? Math.floor(dimX / 2),
      axis: 0 as const,
      label: 'Sagittal (X) Slice Burden',
    };
  }, [profileOrientation, analytics.profiles, coords, dimX, dimY, dimZ]);

  const maxProfileCount = Math.max(1, currentProfileData.peak.count);

  return (
    <div className="bg-atern-surface rounded-sm border border-atern-border p-5 space-y-5 font-mono">
      {/* Header with Title, Unit Selector, and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-atern-border gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-atern-blue" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-atern-text">
              Tumour Volumetric Analysis & Metrics
            </h3>
          </div>
          <p className="text-[11px] text-atern-muted">
            Voxel Volume: {analytics.voxelVolumeMm3.toFixed(3)} mm³ • Spacing: {result.voxel_spacing_mm.map(s => s.toFixed(1)).join('×')} mm
          </p>
        </div>

        {/* Right action group: Unit Switcher + Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unit Switcher */}
          <div className="flex items-center bg-atern-bg p-0.5 rounded-sm border border-atern-border text-xs">
            <button
              type="button"
              onClick={() => setUnitMode('ml')}
              className={`px-2 py-0.5 rounded-sm font-bold uppercase transition-colors cursor-pointer ${
                unitMode === 'ml'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text'
              }`}
            >
              mL
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('mm3')}
              className={`px-2 py-0.5 rounded-sm font-bold uppercase transition-colors cursor-pointer ${
                unitMode === 'mm3'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text'
              }`}
            >
              mm³
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('percent')}
              className={`px-2 py-0.5 rounded-sm font-bold uppercase transition-colors cursor-pointer ${
                unitMode === 'percent'
                  ? 'bg-atern-blue text-white'
                  : 'text-atern-muted hover:text-atern-text'
              }`}
            >
              % WT
            </button>
          </div>

          {/* Download PDF */}
          <button
            type="button"
            onClick={() => generatePdfReport(result)}
            className="px-2.5 py-1 rounded-sm bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download formatted clinical PDF report"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => generateCsvReport(result)}
            className="px-2.5 py-1 rounded-sm bg-atern-bg hover:bg-atern-hover border border-atern-border text-emerald-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download structured CSV report"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          {/* Copy Report */}
          <button
            type="button"
            onClick={handleCopyReport}
            className="px-2.5 py-1 rounded-sm bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-muted hover:text-atern-text text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy text summary to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* 3 Composite Region Cards (WT, TC, ET) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {displayList.map(item => {
          const isVisible = item.region?.visible ?? true;
          const currentOpacity = item.region?.opacity ?? 0.5;

          return (
            <div
              key={item.id}
              className={`p-3.5 rounded-sm border bg-atern-bg ${item.borderClass} flex flex-col justify-between space-y-3`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs uppercase text-atern-text">
                      {item.region?.fullName ?? item.id.toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-bold px-1 py-0.2 rounded-none ${item.badgeClass}`}>
                      {item.id.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-atern-muted mt-0.5 block">
                    {item.tag}
                  </span>
                </div>

                {onToggleRegion && (
                  <button
                    type="button"
                    onClick={() => onToggleRegion(item.id)}
                    className={`p-1 rounded-none border transition-colors cursor-pointer ${
                      isVisible
                        ? 'bg-atern-surface border-atern-border text-atern-text'
                        : 'bg-atern-surface border-atern-border text-atern-muted'
                    }`}
                    title={isVisible ? 'Hide region overlay' : 'Show region overlay'}
                  >
                    {isVisible ? <Eye className="w-3.5 h-3.5 text-atern-blue" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              <div>
                <div className="text-xl sm:text-2xl font-bold tracking-tight text-atern-text">
                  {formatValue(item.volumeMl, item.volumeMm3)}
                </div>
                <div className="text-[11px] text-atern-muted mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>{item.voxelCount.toLocaleString()} voxels</span>
                  <span>•</span>
                  <span>{Math.round(item.volumeMm3).toLocaleString()} mm³</span>
                  {item.id !== 'wt' && analytics.volumes.wt.ml > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-atern-text font-bold">
                        {((item.volumeMl / analytics.volumes.wt.ml) * 100).toFixed(1)}% WT
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Navigation Actions: Centroid & Peak Slice */}
              <div className="pt-2 border-t border-atern-border flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => jumpTo(item.centroid.voxel)}
                  className="px-2 py-1 rounded-none bg-atern-surface hover:bg-atern-hover border border-atern-border text-atern-text hover:text-atern-blue text-[11px] flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title={`Jump crosshair to ${item.id.toUpperCase()} centroid: [${item.centroid.voxel.join(', ')}]`}
                >
                  <Crosshair className="w-3 h-3 text-atern-blue" />
                  <span>Centroid</span>
                  <span className="text-[10px] text-atern-muted">[{item.centroid.voxel[2]}]</span>
                </button>

                <button
                  type="button"
                  onClick={() => jumpToSliceIndex(2, item.peakSlice)}
                  className="px-2 py-1 rounded-none bg-atern-surface hover:bg-atern-hover border border-atern-border text-atern-text hover:text-amber-400 text-[11px] flex items-center space-x-1.5 transition-colors cursor-pointer"
                  title={`Jump axial view to peak slice Z=${item.peakSlice}`}
                >
                  <Flame className="w-3 h-3 text-amber-500" />
                  <span>Peak Z={item.peakSlice}</span>
                </button>
              </div>

              {/* Opacity slider */}
              {onChangeOpacity && isVisible && (
                <div className="pt-1 flex items-center space-x-2 text-[10px] text-atern-muted">
                  <Sliders className="w-3 h-3 text-atern-muted" />
                  <span className="w-10">Alpha:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={currentOpacity}
                    onChange={e => onChangeOpacity(item.id, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-atern-surface appearance-none cursor-pointer accent-atern-blue"
                  />
                  <span className="w-7 text-right font-bold text-atern-text">
                    {Math.round(currentOpacity * 100)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Anatomical Sub-compartment Composition (Flat Segmented Bar) */}
      <div className="p-3.5 rounded-sm bg-atern-bg border border-atern-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
          <span className="font-bold uppercase tracking-wider text-atern-text">
            Exclusive BraTS Sub-compartment Composition (100% WT)
          </span>
          <span className="text-[11px] text-atern-muted">
            Edema (ED) + Necrotic Core (NCR) + Enhancing (ET)
          </span>
        </div>

        {/* Multi-segment Proportional Bar */}
        <div className="h-4 w-full rounded-none overflow-hidden flex bg-atern-surface border border-atern-border">
          {/* Edema segment (Amber) */}
          <div
            style={{ width: `${analytics.ratios.edemaFraction}%` }}
            className="bg-[#D97706] hover:brightness-110 transition-all cursor-pointer relative flex items-center justify-center text-[10px] font-bold text-black"
            title={`Peritumoral Edema (Label 2): ${analytics.volumes.edema.ml.toFixed(2)} mL (${analytics.ratios.edemaFraction.toFixed(1)}%)`}
            onClick={() => jumpTo(analytics.centroids.ed.voxel)}
          >
            {analytics.ratios.edemaFraction > 12 && `${analytics.ratios.edemaFraction.toFixed(0)}% ED`}
          </div>

          {/* Necrotic Core segment (Red) */}
          <div
            style={{ width: `${(analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100}%` }}
            className="bg-[#DC2626] hover:brightness-110 transition-all cursor-pointer relative flex items-center justify-center text-[10px] font-bold text-white"
            title={`Necrotic / Non-Enhancing Core (Label 1): ${analytics.volumes.ncr.ml.toFixed(2)} mL (${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%)`}
            onClick={() => jumpTo(analytics.centroids.ncr.voxel)}
          >
            {(analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100 > 10 &&
              `${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(0)}% NCR`}
          </div>

          {/* Enhancing segment (Blue) */}
          <div
            style={{ width: `${(analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100}%` }}
            className="bg-[#0284C7] hover:brightness-110 transition-all cursor-pointer relative flex items-center justify-center text-[10px] font-bold text-white"
            title={`Enhancing Tumour (Label 4): ${analytics.volumes.et.ml.toFixed(2)} mL (${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%)`}
            onClick={() => jumpTo(analytics.centroids.et.voxel)}
          >
            {(analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100 > 10 &&
              `${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(0)}% ET`}
          </div>
        </div>

        {/* Sub-compartment Jump Mini Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
          <div className="p-2 rounded-none bg-atern-surface border border-atern-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-[#D97706] rounded-none inline-block" />
              <div>
                <span className="font-bold text-atern-text block text-[11px]">Peritumoral Edema (ED)</span>
                <span className="text-[10px] text-atern-muted">
                  {analytics.volumes.edema.ml.toFixed(2)} mL ({analytics.ratios.edemaFraction.toFixed(1)}%)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => jumpTo(analytics.centroids.ed.voxel)}
              className="p-1 text-atern-muted hover:text-atern-blue transition-colors cursor-pointer"
              title="Jump to Edema centroid"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2 rounded-none bg-atern-surface border border-atern-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-[#DC2626] rounded-none inline-block" />
              <div>
                <span className="font-bold text-atern-text block text-[11px]">Necrotic Core (NCR)</span>
                <span className="text-[10px] text-atern-muted">
                  {analytics.volumes.ncr.ml.toFixed(2)} mL ({analytics.ratios.necroticFraction.toFixed(1)}% of TC)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => jumpTo(analytics.centroids.ncr.voxel)}
              className="p-1 text-atern-muted hover:text-atern-blue transition-colors cursor-pointer"
              title="Jump to Necrotic Core centroid"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2 rounded-none bg-atern-surface border border-atern-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-[#0284C7] rounded-none inline-block" />
              <div>
                <span className="font-bold text-atern-text block text-[11px]">Enhancing Tumour (ET)</span>
                <span className="text-[10px] text-atern-muted">
                  {analytics.volumes.et.ml.toFixed(2)} mL ({analytics.ratios.enhancingFraction.toFixed(1)}% of TC)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => jumpTo(analytics.centroids.et.voxel)}
              className="p-1 text-atern-muted hover:text-atern-blue transition-colors cursor-pointer"
              title="Jump to Enhancing Tumour centroid"
            >
              <Crosshair className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Morphometric Burden Dimensions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
          <span className="text-[10px] uppercase text-atern-muted">Enhancing / Core</span>
          <div className="text-base font-bold text-atern-text">
            {analytics.ratios.enhancingFraction.toFixed(1)}%
          </div>
          <span className="text-[10px] text-atern-muted">ET ÷ TC active fraction</span>
        </div>

        <div className="p-3 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
          <span className="text-[10px] uppercase text-atern-muted">Core / Whole</span>
          <div className="text-base font-bold text-atern-text">
            {analytics.ratios.coreToWholeRatio.toFixed(1)}%
          </div>
          <span className="text-[10px] text-atern-muted">TC ÷ WT pathology ratio</span>
        </div>

        <div className="p-3 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
          <span className="text-[10px] uppercase text-atern-muted flex items-center justify-between">
            <span>Bounding Box</span>
            <Box className="w-3 h-3 text-[#D97706]" />
          </span>
          <div className="text-sm font-bold text-atern-text">
            {analytics.bbox
              ? `${analytics.bbox.sizeMm[0].toFixed(0)} × ${analytics.bbox.sizeMm[1].toFixed(0)} × ${analytics.bbox.sizeMm[2].toFixed(0)} mm`
              : 'N/A'}
          </div>
          <span className="text-[10px] text-atern-muted">X(RL) × Y(AP) × Z(SI)</span>
        </div>

        <div className="p-3 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
          <span className="text-[10px] uppercase text-atern-muted flex items-center justify-between">
            <span>Max 3D Caliper</span>
            <Ruler className="w-3 h-3 text-atern-blue" />
          </span>
          <div className="text-base font-bold text-atern-text">
            {analytics.maxDiameter3dMm.toFixed(1)} mm
          </div>
          <span className="text-[10px] text-atern-muted">Diagonal Feret span</span>
        </div>
      </div>

      {/* Interactive Slice-by-Slice Tumor Burden Histogram */}
      <div className="p-3.5 rounded-sm bg-atern-bg border border-atern-border space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-atern-blue" />
            <span className="font-bold uppercase tracking-wider text-atern-text">
              Slice Burden Profile: {currentProfileData.label}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-atern-surface p-0.5 rounded-none border border-atern-border text-[11px]">
              <button
                type="button"
                onClick={() => setProfileOrientation('axial')}
                className={`px-2 py-0.5 rounded-none uppercase transition-colors cursor-pointer ${
                  profileOrientation === 'axial'
                    ? 'bg-atern-blue text-white font-bold'
                    : 'text-atern-muted hover:text-atern-text'
                }`}
              >
                Axial
              </button>
              <button
                type="button"
                onClick={() => setProfileOrientation('coronal')}
                className={`px-2 py-0.5 rounded-none uppercase transition-colors cursor-pointer ${
                  profileOrientation === 'coronal'
                    ? 'bg-atern-blue text-white font-bold'
                    : 'text-atern-muted hover:text-atern-text'
                }`}
              >
                Coronal
              </button>
              <button
                type="button"
                onClick={() => setProfileOrientation('sagittal')}
                className={`px-2 py-0.5 rounded-none uppercase transition-colors cursor-pointer ${
                  profileOrientation === 'sagittal'
                    ? 'bg-atern-blue text-white font-bold'
                    : 'text-atern-muted hover:text-atern-text'
                }`}
              >
                Sagittal
              </button>
            </div>

            <button
              type="button"
              onClick={() => jumpToSliceIndex(currentProfileData.axis, currentProfileData.peak.slice)}
              className="px-2 py-0.5 rounded-none bg-atern-surface hover:bg-atern-hover border border-atern-border text-amber-400 text-[11px] flex items-center space-x-1 cursor-pointer"
              title="Jump to slice with highest lesion voxel count"
            >
              <Flame className="w-3 h-3 text-amber-500" />
              <span>Peak: Slice {currentProfileData.peak.slice} ({currentProfileData.peak.count.toLocaleString()} voxels)</span>
            </button>
          </div>
        </div>

        {/* Visual Clickable Histogram */}
        <div className="relative pt-1 pb-1">
          <div className="h-18 w-full flex items-end gap-[1px] bg-atern-surface p-2 rounded-none border border-atern-border overflow-hidden">
            {Array.from({ length: currentProfileData.length }).map((_, idx) => {
              const count = currentProfileData.counts[idx];
              const heightPct = count > 0 ? Math.max(8, (count / maxProfileCount) * 100) : 0;
              const isCurrent = coords && coords.voxel[currentProfileData.axis] === idx;
              const isPeak = idx === currentProfileData.peak.slice;

              return (
                <div
                  key={idx}
                  onClick={() => jumpToSliceIndex(currentProfileData.axis, idx)}
                  style={{ height: `${heightPct}%` }}
                  className={`flex-1 min-w-[1px] transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-white z-10'
                      : isPeak
                      ? 'bg-amber-500'
                      : count > 0
                      ? 'bg-atern-blue hover:bg-atern-blue-hover'
                      : 'bg-atern-border/60 hover:bg-atern-border'
                  }`}
                  title={`Slice ${idx}: ${count.toLocaleString()} voxels (${((count * analytics.voxelVolumeMm3) / 1000).toFixed(2)} mL). Click to jump.`}
                />
              );
            })}
          </div>

          <div className="flex justify-between items-center text-[10px] text-atern-muted mt-1 px-1">
            <span>Slice 0</span>
            <span className="text-atern-blue font-bold">
              Current: Slice {coords ? coords.voxel[currentProfileData.axis] : '—'}
            </span>
            <span>Slice {currentProfileData.length - 1}</span>
          </div>
        </div>
      </div>

      {/* Expert Mask Comparison (if present) */}
      {result.expert_metrics && (
        <div className="p-3.5 rounded-sm bg-atern-bg border border-atern-border space-y-2.5">
          <div className="flex items-center space-x-2">
            <Compass className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold uppercase text-atern-text">
              Expert Benchmark Reference Dice Scores
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            {Object.entries(result.expert_metrics).map(([key, metric]) => (
              <div key={key} className="p-2.5 rounded-none bg-atern-surface border border-atern-border space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-atern-muted">{key.replace('_', ' ')}</span>
                <div className="text-base font-bold text-emerald-400">
                  Dice {(metric.dice * 100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-atern-muted">
                  {metric.predicted_voxel_count.toLocaleString()} pred / {metric.reference_voxel_count.toLocaleString()} ref voxels
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclosures & Formula */}
      <div className="p-3 rounded-none bg-atern-bg border border-atern-border flex items-start space-x-2 text-[11px] text-atern-muted">
        <Info className="w-3.5 h-3.5 text-atern-blue flex-shrink-0 mt-0.5" />
        <span className="leading-snug">
          V = N_voxels × |det(affine)| ÷ 1000 mL. BraTS labels: WT (1+2+4), TC (1+4), ET (4). Exclusive sub-compartments: ED = WT \ TC, NCR = TC \ ET. Research prototype.
        </span>
      </div>
    </div>
  );
};
