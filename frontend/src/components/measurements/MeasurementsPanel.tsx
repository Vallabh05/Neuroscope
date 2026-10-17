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
  ChevronRight,
  Compass,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Flame,
  Info,
  Layers,
  Maximize2,
  Navigation,
  PieChart,
  Ruler,
  Sliders,
  Sparkles,
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
  const [selectedSubregion, setSelectedSubregion] = useState<'all' | 'wt' | 'tc' | 'et' | 'ncr' | 'ed'>('all');
  const [profileOrientation, setProfileOrientation] = useState<ProfileOrientation>('axial');
  const [copied, setCopied] = useState(false);

  const [dimX, dimY, dimZ] = result.dimensions;

  // Shared high-performance analytics calculation over typed mask array
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
    return `${pct.toFixed(1)}% of WT`;
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
      `Active Enhancing (ET): ${analytics.volumes.et.ml.toFixed(2)} mL (${(analytics.ratios.enhancingFraction).toFixed(1)}% of TC)`,
      `Necrotic/Non-enhancing Core (NCR): ${analytics.volumes.ncr.ml.toFixed(2)} mL (${(analytics.ratios.necroticFraction).toFixed(1)}% of TC)`,
      `Peritumoral Edema (ED): ${analytics.volumes.edema.ml.toFixed(2)} mL (${(analytics.ratios.edemaFraction).toFixed(1)}% of WT)`,
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
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDownloadCsv = () => {
    const csvContent = [
      'Region_ID,Region_Name,Stored_Labels,Volume_mL,Volume_mm3,Voxel_Count,Percent_WT,Centroid_Voxel_X,Centroid_Voxel_Y,Centroid_Voxel_Z,Centroid_World_X_mm,Centroid_World_Y_mm,Centroid_World_Z_mm',
      `WT,Whole Tumour,1+2+4,${analytics.volumes.wt.ml.toFixed(3)},${analytics.volumes.wt.mm3.toFixed(1)},${analytics.volumes.wt.count},100.0,${analytics.centroids.wt.voxel[0]},${analytics.centroids.wt.voxel[1]},${analytics.centroids.wt.voxel[2]},${analytics.centroids.wt.world[0]},${analytics.centroids.wt.world[1]},${analytics.centroids.wt.world[2]}`,
      `TC,Tumour Core,1+4,${analytics.volumes.tc.ml.toFixed(3)},${analytics.volumes.tc.mm3.toFixed(1)},${analytics.volumes.tc.count},${analytics.ratios.coreToWholeRatio.toFixed(1)},${analytics.centroids.tc.voxel[0]},${analytics.centroids.tc.voxel[1]},${analytics.centroids.tc.voxel[2]},${analytics.centroids.tc.world[0]},${analytics.centroids.tc.world[1]},${analytics.centroids.tc.world[2]}`,
      `ET,Enhancing Tumour,4,${analytics.volumes.et.ml.toFixed(3)},${analytics.volumes.et.mm3.toFixed(1)},${analytics.volumes.et.count},${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)},${analytics.centroids.et.voxel[0]},${analytics.centroids.et.voxel[1]},${analytics.centroids.et.voxel[2]},${analytics.centroids.et.world[0]},${analytics.centroids.et.world[1]},${analytics.centroids.et.world[2]}`,
      `NCR,Necrotic Non-Enhancing Core,1,${analytics.volumes.ncr.ml.toFixed(3)},${analytics.volumes.ncr.mm3.toFixed(1)},${analytics.volumes.ncr.count},${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)},${analytics.centroids.ncr.voxel[0]},${analytics.centroids.ncr.voxel[1]},${analytics.centroids.ncr.voxel[2]},${analytics.centroids.ncr.world[0]},${analytics.centroids.ncr.world[1]},${analytics.centroids.ncr.world[2]}`,
      `ED,Peritumoral Edema,2,${analytics.volumes.edema.ml.toFixed(3)},${analytics.volumes.edema.mm3.toFixed(1)},${analytics.volumes.edema.count},${analytics.ratios.edemaFraction.toFixed(1)},${analytics.centroids.ed.voxel[0]},${analytics.centroids.ed.voxel[1]},${analytics.centroids.ed.voxel[2]},${analytics.centroids.ed.world[0]},${analytics.centroids.ed.world[1]},${analytics.centroids.ed.world[2]}`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${result.case_id}_volumetric_analysis.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const activeRegions = regions ?? result.volumes;

  const displayList = [
    {
      id: 'wt' as const,
      region: activeRegions.wt,
      colorBorder: 'border-amber-500/50 hover:border-amber-400',
      colorBg: 'bg-amber-950/20',
      colorBadge: 'bg-amber-500 text-neuro-950',
      textColor: 'text-amber-400',
      glowColor: 'shadow-amber-500/10',
      tag: 'Labels 1 + 2 + 4',
      volumeMl: analytics.volumes.wt.ml,
      volumeMm3: analytics.volumes.wt.mm3,
      voxelCount: analytics.volumes.wt.count,
      centroid: analytics.centroids.wt,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Entire hyperintense lesion including vasogenic edema and non-enhancing margins.',
    },
    {
      id: 'tc' as const,
      region: activeRegions.tc,
      colorBorder: 'border-red-500/50 hover:border-red-400',
      colorBg: 'bg-red-950/20',
      colorBadge: 'bg-red-500 text-white',
      textColor: 'text-red-400',
      glowColor: 'shadow-red-500/10',
      tag: 'Labels 1 + 4',
      volumeMl: analytics.volumes.tc.ml,
      volumeMm3: analytics.volumes.tc.mm3,
      voxelCount: analytics.volumes.tc.count,
      centroid: analytics.centroids.tc,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Resectable pathological target: active angiogenic tumor plus central necrosis.',
    },
    {
      id: 'et' as const,
      region: activeRegions.et,
      colorBorder: 'border-cyan-500/50 hover:border-cyan-400',
      colorBg: 'bg-cyan-950/20',
      colorBadge: 'bg-cyan-400 text-neuro-950',
      textColor: 'text-cyan-400',
      glowColor: 'shadow-cyan-500/10',
      tag: 'Label 4 only',
      volumeMl: analytics.volumes.et.ml,
      volumeMm3: analytics.volumes.et.mm3,
      voxelCount: analytics.volumes.et.count,
      centroid: analytics.centroids.et,
      peakSlice: analytics.profiles.peaks.axial.slice,
      clinicalDesc: 'Viable vascularized tumor with disrupted blood-brain barrier on post-contrast T1Gd.',
    },
  ];

  // Active slice profile data based on selected orientation
  const currentProfileData = useMemo(() => {
    if (profileOrientation === 'axial') {
      return {
        counts: analytics.profiles.axial,
        length: dimZ,
        peak: analytics.profiles.peaks.axial,
        current: coords?.voxel[2] ?? Math.floor(dimZ / 2),
        axis: 2 as const,
        label: 'Axial (Z) Slice Burden',
        axisName: 'Slice (Inferior → Superior)',
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
        axisName: 'Slice (Posterior → Anterior)',
      };
    }
    return {
      counts: analytics.profiles.sagittal,
      length: dimX,
      peak: analytics.profiles.peaks.sagittal,
      current: coords?.voxel[0] ?? Math.floor(dimX / 2),
      axis: 0 as const,
      label: 'Sagittal (X) Slice Burden',
      axisName: 'Slice (Left → Right)',
    };
  }, [profileOrientation, analytics.profiles, coords, dimX, dimY, dimZ]);

  const maxProfileCount = Math.max(1, currentProfileData.peak.count);

  return (
    <div className="bg-neuro-900 rounded-2xl border border-neuro-800 p-5 space-y-6 shadow-xl">
      {/* Header with Title, Unit Selector, and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neuro-800 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-sm">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-bold text-slate-100 tracking-tight">Tumour Volumetric Analysis</h3>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Interactive Workstation
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              3D voxel integral ({analytics.voxelVolumeMm3.toFixed(3)} mm³/voxel) • Spacing {result.voxel_spacing_mm.map(s => s.toFixed(1)).join('×')} mm
            </p>
          </div>
        </div>

        {/* Right action group: Unit Switcher + Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Unit Switcher */}
          <div className="flex items-center bg-neuro-950 p-1 rounded-xl border border-neuro-800 text-xs">
            <button
              type="button"
              onClick={() => setUnitMode('ml')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                unitMode === 'ml'
                  ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              mL (cm³)
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('mm3')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                unitMode === 'mm3'
                  ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              mm³
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('percent')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                unitMode === 'percent'
                  ? 'bg-cyan-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              % WT
            </button>
          </div>

          {/* Download PDF */}
          <button
            type="button"
            onClick={() => generatePdfReport(result)}
            className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-cyan-600/20 transition-all hover:scale-[1.02]"
            title="Download formatted clinical and volumetric analysis report as PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => generateCsvReport(result)}
            className="px-3 py-1.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-emerald-600/40 text-emerald-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Download structured spreadsheet report with all volumetric metrics"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV</span>
          </button>

          {/* Copy Report */}
          <button
            type="button"
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-neuro-750 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Copy clinical and volumetric summary to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* 3 Interactive Composite Region Cards (WT, TC, ET) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {displayList.map((item) => {
          const isVisible = item.region?.visible ?? true;
          const currentOpacity = item.region?.opacity ?? 0.5;

          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all duration-200 ${item.colorBorder} ${item.colorBg} flex flex-col justify-between space-y-4 relative overflow-hidden shadow-sm hover:${item.glowColor}`}
            >
              {/* Card Header with Name and Visibility Toggle */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-white block">
                      {item.region?.fullName ?? item.id.toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${item.colorBadge}`}>
                      {item.id.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">
                    {item.tag}
                  </span>
                </div>

                {/* Direct Visibility Toggle */}
                {onToggleRegion && (
                  <button
                    type="button"
                    onClick={() => onToggleRegion(item.id)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      isVisible
                        ? 'bg-neuro-950/80 border-slate-700 text-slate-200 hover:text-white'
                        : 'bg-neuro-950/40 border-slate-800 text-slate-600 hover:text-slate-400'
                    }`}
                    title={isVisible ? 'Hide region overlay in 2D and 3D' : 'Show region overlay'}
                  >
                    {isVisible ? <Eye className="w-4 h-4 text-cyan-400" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                )}
              </div>

              {/* Volume Figure & Voxel Statistics */}
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white">
                  {formatValue(item.volumeMl, item.volumeMm3)}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{item.voxelCount.toLocaleString()} voxels</span>
                  <span>•</span>
                  <span>{(item.volumeMl * 1000).toFixed(0)} mm³</span>
                  {item.id !== 'wt' && analytics.volumes.wt.ml > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-slate-300 font-semibold">
                        {((item.volumeMl / analytics.volumes.wt.ml) * 100).toFixed(1)}% WT
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Interactive Navigation Actions: Centroid & Peak Slice */}
              <div className="pt-2 border-t border-neuro-800/80 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => jumpTo(item.centroid.voxel)}
                  className="px-2.5 py-1.5 rounded-lg bg-neuro-950/90 hover:bg-neuro-950 border border-neuro-750 text-slate-200 hover:text-cyan-300 text-xs font-medium flex items-center space-x-1.5 transition-colors group"
                  title={`Jump crosshairs to ${item.id.toUpperCase()} 3D centroid: [${item.centroid.voxel.join(', ')}]`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span>Centroid</span>
                  <span className="text-[10px] font-mono text-slate-500">[{item.centroid.voxel[2]}]</span>
                </button>

                <button
                  type="button"
                  onClick={() => jumpToSliceIndex(2, item.peakSlice)}
                  className="px-2.5 py-1.5 rounded-lg bg-neuro-950/90 hover:bg-neuro-950 border border-neuro-750 text-slate-200 hover:text-amber-300 text-xs font-medium flex items-center space-x-1.5 transition-colors group"
                  title={`Jump axial view to peak slice Z=${item.peakSlice}`}
                >
                  <Flame className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span>Peak Z={item.peakSlice}</span>
                </button>
              </div>

              {/* Opacity slider right inside the card */}
              {onChangeOpacity && isVisible && (
                <div className="pt-1 flex items-center space-x-2 text-[11px] text-slate-400">
                  <Sliders className="w-3 h-3 text-slate-500" />
                  <span className="w-12">Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={currentOpacity}
                    onChange={(e) => onChangeOpacity(item.id, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-neuro-950 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                  <span className="w-8 text-right font-mono text-[10px] text-slate-300">
                    {Math.round(currentOpacity * 100)}%
                  </span>
                </div>
              )}

              {/* Clinical note */}
              <p className="text-[11px] text-slate-400 leading-snug border-t border-neuro-800/40 pt-2">
                {item.clinicalDesc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Anatomical Sub-compartment Decomposition & Proportion Bar */}
      <div className="p-4 rounded-xl bg-neuro-950 border border-neuro-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <PieChart className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200">
              Exclusive BraTS Sub-compartment Composition (100% of WT)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            Exclusive partition: Edema (ED) + Necrotic Core (NCR) + Enhancing (ET) = Whole Tumour
          </span>
        </div>

        {/* Multi-segment Proportional Bar */}
        <div className="space-y-1.5">
          <div className="h-4 w-full rounded-lg overflow-hidden flex bg-neuro-900 border border-neuro-800">
            {/* Edema segment (Yellow) */}
            <div
              style={{ width: `${analytics.ratios.edemaFraction}%` }}
              className="bg-amber-500 hover:bg-amber-400 transition-all cursor-pointer relative group flex items-center justify-center text-[10px] font-bold text-neuro-950"
              title={`Peritumoral Edema (Label 2): ${analytics.volumes.edema.ml.toFixed(2)} mL (${analytics.ratios.edemaFraction.toFixed(1)}%)`}
              onClick={() => jumpTo(analytics.centroids.ed.voxel)}
            >
              {analytics.ratios.edemaFraction > 12 && `${analytics.ratios.edemaFraction.toFixed(0)}%`}
            </div>

            {/* Necrotic Core segment (Red) */}
            <div
              style={{ width: `${(analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100}%` }}
              className="bg-red-500 hover:bg-red-400 transition-all cursor-pointer relative group flex items-center justify-center text-[10px] font-bold text-white"
              title={`Necrotic / Non-Enhancing Core (Label 1): ${analytics.volumes.ncr.ml.toFixed(2)} mL (${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%)`}
              onClick={() => jumpTo(analytics.centroids.ncr.voxel)}
            >
              {(analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100 > 10 &&
                `${((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(0)}%`}
            </div>

            {/* Enhancing segment (Cyan) */}
            <div
              style={{ width: `${(analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100}%` }}
              className="bg-cyan-400 hover:bg-cyan-300 transition-all cursor-pointer relative group flex items-center justify-center text-[10px] font-bold text-neuro-950"
              title={`Enhancing Tumour (Label 4): ${analytics.volumes.et.ml.toFixed(2)} mL (${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%)`}
              onClick={() => jumpTo(analytics.centroids.et.voxel)}
            >
              {(analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100 > 10 &&
                `${((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(0)}%`}
            </div>
          </div>

          {/* Sub-compartment Mini Cards with Jump buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            {/* Edema (ED) */}
            <div className="p-2.5 rounded-lg bg-neuro-900 border border-neuro-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Peritumoral Edema (ED)</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {analytics.volumes.edema.ml.toFixed(2)} mL • {analytics.ratios.edemaFraction.toFixed(1)}% of WT
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => jumpTo(analytics.centroids.ed.voxel)}
                className="p-1 rounded hover:bg-neuro-850 text-slate-400 hover:text-amber-400 transition-colors"
                title="Jump to Edema centroid"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Necrotic Core (NCR) */}
            <div className="p-2.5 rounded-lg bg-neuro-900 border border-neuro-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Necrotic Core (NCR)</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {analytics.volumes.ncr.ml.toFixed(2)} mL • {analytics.ratios.necroticFraction.toFixed(1)}% of TC
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => jumpTo(analytics.centroids.ncr.voxel)}
                className="p-1 rounded hover:bg-neuro-850 text-slate-400 hover:text-red-400 transition-colors"
                title="Jump to Necrotic Core centroid"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Enhancing Tumor (ET) */}
            <div className="p-2.5 rounded-lg bg-neuro-900 border border-neuro-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Enhancing Tumour (ET)</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {analytics.volumes.et.ml.toFixed(2)} mL • {analytics.ratios.enhancingFraction.toFixed(1)}% of TC
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => jumpTo(analytics.centroids.et.voxel)}
                className="p-1 rounded hover:bg-neuro-850 text-slate-400 hover:text-cyan-400 transition-colors"
                title="Jump to Enhancing Tumour centroid"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Morphometric Burden Dimensions & Key Clinical Ratios */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Enhancing Fraction */}
        <div className="p-3.5 rounded-xl bg-neuro-950 border border-neuro-800 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
            <span>Enhancing / Core</span>
            <span className="text-cyan-400 font-mono text-[10px]">ET ÷ TC</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {analytics.ratios.enhancingFraction.toFixed(1)}%
          </div>
          <p className="text-[10px] text-slate-500">Active vascularized portion of tumor core</p>
        </div>

        {/* Core / Whole Ratio */}
        <div className="p-3.5 rounded-xl bg-neuro-950 border border-neuro-800 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
            <span>Core / Whole</span>
            <span className="text-red-400 font-mono text-[10px]">TC ÷ WT</span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {analytics.ratios.coreToWholeRatio.toFixed(1)}%
          </div>
          <p className="text-[10px] text-slate-500">Proportion representing core pathology</p>
        </div>

        {/* 3D Extent / Bounding Box */}
        <div className="p-3.5 rounded-xl bg-neuro-950 border border-neuro-800 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
            <span>Bounding Box</span>
            <Box className="w-3 h-3 text-amber-400" />
          </div>
          <div className="text-sm font-bold font-mono text-slate-200">
            {analytics.bbox
              ? `${analytics.bbox.sizeMm[0].toFixed(0)} × ${analytics.bbox.sizeMm[1].toFixed(0)} × ${analytics.bbox.sizeMm[2].toFixed(0)} mm`
              : 'N/A'}
          </div>
          <p className="text-[10px] text-slate-500">X(RL) × Y(AP) × Z(SI) physical extents</p>
        </div>

        {/* Max Estimated Caliper Diameter */}
        <div className="p-3.5 rounded-xl bg-neuro-950 border border-neuro-800 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 flex items-center justify-between">
            <span>Max 3D Caliper</span>
            <Ruler className="w-3 h-3 text-cyan-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {analytics.maxDiameter3dMm.toFixed(1)} mm
          </div>
          <p className="text-[10px] text-slate-500">Diagonal Feret lesion span estimate</p>
        </div>
      </div>

      {/* Interactive Slice-by-Slice Tumor Burden Profile */}
      <div className="p-4 rounded-xl bg-neuro-950 border border-neuro-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200">
              Interactive Slice Burden Profile: {currentProfileData.label}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Orientation selector tabs */}
            <div className="flex items-center bg-neuro-900 p-0.5 rounded-lg border border-neuro-800 text-[11px]">
              <button
                type="button"
                onClick={() => setProfileOrientation('axial')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  profileOrientation === 'axial' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Axial (Z)
              </button>
              <button
                type="button"
                onClick={() => setProfileOrientation('coronal')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  profileOrientation === 'coronal' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Coronal (Y)
              </button>
              <button
                type="button"
                onClick={() => setProfileOrientation('sagittal')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  profileOrientation === 'sagittal' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Sagittal (X)
              </button>
            </div>

            {/* Peak slice button */}
            <button
              type="button"
              onClick={() => jumpToSliceIndex(currentProfileData.axis, currentProfileData.peak.slice)}
              className="px-2 py-0.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 border border-amber-800/40 text-amber-300 text-[11px] font-mono flex items-center space-x-1"
              title="Jump to slice with maximum tumor burden"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>Peak: Slice {currentProfileData.peak.slice} ({currentProfileData.peak.count.toLocaleString()} voxels)</span>
            </button>
          </div>
        </div>

        {/* Visual Clickable SVG Histogram */}
        <div className="relative pt-1 pb-2">
          <div className="h-20 w-full flex items-end gap-[1px] bg-neuro-900/60 p-2 rounded-lg border border-neuro-800/80 overflow-hidden">
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
                  className={`flex-1 min-w-[1px] transition-all cursor-pointer relative group rounded-t-[1px] ${
                    isCurrent
                      ? 'bg-cyan-300 shadow-md shadow-cyan-500/50 z-10 ring-1 ring-white'
                      : isPeak
                      ? 'bg-amber-400 hover:bg-amber-300'
                      : count > 0
                      ? 'bg-cyan-600/70 hover:bg-cyan-400'
                      : 'bg-slate-800/40 hover:bg-slate-700/60'
                  }`}
                  title={`Slice ${idx}: ${count.toLocaleString()} tumour voxels (${((count * analytics.voxelVolumeMm3) / 1000).toFixed(2)} mL). Click to jump.`}
                />
              );
            })}
          </div>

          {/* Histogram axis labels */}
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 mt-1 px-1">
            <span>Slice 0</span>
            <span className="text-cyan-400 font-semibold">
              Current: Slice {coords ? coords.voxel[currentProfileData.axis] : '—'}
            </span>
            <span>Slice {currentProfileData.length - 1}</span>
          </div>
        </div>
      </div>

      {/* Optional Expert Comparison Tab (only when expert metrics exist) */}
      {result.expert_metrics && (
        <div className="p-4 rounded-xl bg-neuro-950 border border-neuro-800 space-y-3">
          <div className="flex items-center space-x-2">
            <Compass className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-100">BraTS Expert Mask Comparison</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(result.expert_metrics).map(([key, metric]) => (
              <div key={key} className="p-3 rounded-lg bg-neuro-900 border border-neuro-800 space-y-1">
                <span className="text-xs font-bold text-white uppercase">{key.replace('_', ' ')}</span>
                <div className="flex items-baseline space-x-2">
                  <span className="text-lg font-mono font-bold text-emerald-400">
                    Dice {(metric.dice * 100).toFixed(1)}%
                  </span>
                  {metric.sensitivity !== null && (
                    <span className="text-xs font-mono text-slate-400">
                      Sens {(metric.sensitivity * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {metric.predicted_voxel_count.toLocaleString()} pred / {metric.reference_voxel_count.toLocaleString()} ref voxels
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Methodology & Safety Disclosure */}
      <div className="p-3.5 rounded-xl bg-neuro-950 border border-neuro-850 flex items-start space-x-2.5 text-[11px] text-slate-400">
        <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <strong>Volume calculation methodology:</strong> Physical volume V = N_voxels × |det(affine[:3,:3])| ÷ 1000 mL.
          The affine voxel volume is {analytics.voxelVolumeMm3.toFixed(3)} mm³ ({result.voxel_spacing_mm.map(s => s.toFixed(1)).join('×')} mm).
          WT, TC, and ET are nested BraTS regions (ET ⊆ TC ⊆ WT); exclusive sub-compartments are Enhancing (ET), Necrotic Core (TC \ ET), and Edema (WT \ TC).
          For research and educational exploration only.
        </span>
      </div>
    </div>
  );
};
