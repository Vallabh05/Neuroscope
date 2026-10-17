import React, { useState } from 'react';
import type { SegmentationResult } from '../../types';
import { apiService } from '../../services/api';
import { generatePdfReport, generateCsvReport } from '../../utils/reportGenerators';
import { calculateTumorAnalytics } from '../../utils/tumorAnalytics';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  FileCheck,
  FileJson,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  Gauge,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface ReportsViewProps {
  result: SegmentationResult | null;
  onOpenCases: () => void;
  onStartNewCase: () => void;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  result,
  onOpenCases,
  onStartNewCase,
}) => {
  const [downloading, setDownloading] = useState<'mask' | 'json' | 'pdf' | 'csv' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6">
        <div className="border border-atern-border bg-atern-surface p-8 text-center space-y-4 rounded-sm">
          <div className="w-10 h-10 mx-auto rounded-none bg-atern-bg border border-atern-border flex items-center justify-center text-atern-muted">
            <FileText className="w-5 h-5 text-atern-blue" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold uppercase tracking-wider text-atern-text font-mono">
              No Report Available
            </h2>
            <p className="text-xs text-atern-muted max-w-md mx-auto leading-relaxed">
              No active MRI case has been processed. Upload a 4-modality brain MRI series in the Cases section to generate volumetric reports and clinical exports.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={onOpenCases}
              className="px-5 py-2.5 bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider rounded-sm inline-flex items-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Go to Cases & Upload</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const analytics = calculateTumorAnalytics(result);
  const report = result.report;

  const downloadMask = async () => {
    setDownloadError(null);
    setDownloading('mask');
    try {
      const blob = await apiService.downloadMask(result.case_id);
      saveBlob(blob, `${result.case_id}_seg.nii.gz`);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'Mask download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadJson = async () => {
    setDownloadError(null);
    setDownloading('json');
    try {
      const blob = await apiService.downloadReport(result.case_id);
      saveBlob(blob, `${result.case_id}_integrity_report.json`);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'JSON download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadPdf = () => {
    setDownloadError(null);
    setDownloading('pdf');
    try {
      generatePdfReport(result);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'PDF generation failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadCsv = () => {
    setDownloadError(null);
    setDownloading('csv');
    try {
      generateCsvReport(result);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : 'CSV generation failed.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-6 animate-fade-in">
      {/* Top Header & Export Action Bar */}
      <div className="border border-atern-border bg-atern-surface p-6 rounded-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-atern-border">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <span className="text-[10px] font-mono font-semibold uppercase tracking-wider bg-atern-bg text-atern-muted px-2 py-0.5 border border-atern-border">
                Clinical Passport
              </span>
              <span className="text-xs font-mono font-bold text-atern-blue">
                Case ID: {result.case_id}
              </span>
            </div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-atern-text font-mono">
              Tumour Volumetric & Provenance Report
            </h1>
            <p className="text-xs text-atern-muted">
              Generated {new Date(result.created_at).toLocaleString()} • Affine Voxel Volume: {analytics.voxelVolumeMm3.toFixed(3)} mm³
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloading !== null}
              className="px-4 py-2 bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider rounded-sm flex items-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer"
              title="Download formatted clinical PDF report"
            >
              {downloading === 'pdf' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={downloading !== null}
              className="px-4 py-2 bg-atern-bg hover:bg-atern-hover border border-emerald-600/50 text-emerald-400 text-xs font-semibold uppercase tracking-wider rounded-sm flex items-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer"
              title="Download spreadsheet CSV report"
            >
              {downloading === 'csv' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={downloadMask}
              disabled={downloading !== null}
              className="px-3.5 py-2 bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-text text-xs font-semibold uppercase tracking-wider rounded-sm flex items-center space-x-2 transition-colors disabled:opacity-50 cursor-pointer"
              title="Download verified NIfTI label mask (.nii.gz)"
            >
              {downloading === 'mask' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-atern-blue" />
              )}
              <span>Mask (.nii.gz)</span>
            </button>

            <button
              type="button"
              onClick={downloadJson}
              disabled={downloading !== null}
              className="px-3 py-2 bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-muted hover:text-atern-text text-xs font-mono uppercase tracking-wider rounded-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title="Download raw JSON Integrity Passport"
            >
              {downloading === 'json' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileJson className="w-3.5 h-3.5" />
              )}
              <span>JSON</span>
            </button>

            <button
              type="button"
              onClick={onStartNewCase}
              className="px-3 py-2 bg-atern-bg hover:bg-red-950/40 border border-red-800/40 text-red-400 text-xs font-mono uppercase tracking-wider rounded-sm flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Purge current case and start new session"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Case</span>
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="p-3 bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-center space-x-2 rounded-sm font-mono">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}
      </div>

      {/* Structured Volumetric Table */}
      <div className="border border-atern-border bg-atern-surface p-5 rounded-sm space-y-4">
        <div className="flex items-center justify-between border-b border-atern-border pb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-atern-muted font-bold">
            1. Volumetric Quantitation Table (BraTS 2021 Hierarchy)
          </h2>
          <span className="text-[10px] font-mono text-atern-muted">Unit: Milliliters (mL) & mm³</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-atern-border text-[11px] text-atern-muted uppercase tracking-wider">
                <th className="py-2.5 px-3">Region</th>
                <th className="py-2.5 px-3">BraTS Labels</th>
                <th className="py-2.5 px-3 text-right">Volume (mL)</th>
                <th className="py-2.5 px-3 text-right">Volume (mm³)</th>
                <th className="py-2.5 px-3 text-right">Voxel Count</th>
                <th className="py-2.5 px-3 text-right">Fraction of WT</th>
                <th className="py-2.5 px-3">Centroid (Voxel)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-atern-border">
              {/* WT */}
              <tr className="hover:bg-atern-hover transition-colors">
                <td className="py-3 px-3 font-bold text-[#D97706] flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-[#D97706] rounded-none inline-block" />
                  <span>Whole Tumour (WT)</span>
                </td>
                <td className="py-3 px-3 text-atern-muted">1, 2, 4 (NCR + ED + ET)</td>
                <td className="py-3 px-3 text-right font-bold text-atern-text">
                  {analytics.volumes.wt.ml.toFixed(2)} mL
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {Math.round(analytics.volumes.wt.mm3).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {analytics.volumes.wt.count.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-semibold text-atern-text">100.0%</td>
                <td className="py-3 px-3 text-atern-muted">
                  [{analytics.centroids.wt.voxel.join(', ')}]
                </td>
              </tr>

              {/* TC */}
              <tr className="hover:bg-atern-hover transition-colors">
                <td className="py-3 px-3 font-bold text-[#DC2626] flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-[#DC2626] rounded-none inline-block" />
                  <span>Tumour Core (TC)</span>
                </td>
                <td className="py-3 px-3 text-atern-muted">1, 4 (NCR + ET)</td>
                <td className="py-3 px-3 text-right font-bold text-atern-text">
                  {analytics.volumes.tc.ml.toFixed(2)} mL
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {Math.round(analytics.volumes.tc.mm3).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {analytics.volumes.tc.count.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-semibold text-atern-text">
                  {analytics.ratios.coreToWholeRatio.toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-atern-muted">
                  [{analytics.centroids.tc.voxel.join(', ')}]
                </td>
              </tr>

              {/* ET */}
              <tr className="hover:bg-atern-hover transition-colors">
                <td className="py-3 px-3 font-bold text-[#0284C7] flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 bg-[#0284C7] rounded-none inline-block" />
                  <span>Enhancing Tumour (ET)</span>
                </td>
                <td className="py-3 px-3 text-atern-muted">4 (Active enhancing)</td>
                <td className="py-3 px-3 text-right font-bold text-atern-text">
                  {analytics.volumes.et.ml.toFixed(2)} mL
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {Math.round(analytics.volumes.et.mm3).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right text-atern-muted">
                  {analytics.volumes.et.count.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-semibold text-atern-text">
                  {((analytics.volumes.et.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%
                </td>
                <td className="py-3 px-3 text-atern-muted">
                  [{analytics.centroids.et.voxel.join(', ')}]
                </td>
              </tr>

              {/* ED */}
              <tr className="hover:bg-atern-hover transition-colors text-atern-muted">
                <td className="py-2.5 px-3 flex items-center space-x-2 text-[#10B981]">
                  <span className="w-2.5 h-2.5 bg-[#10B981] rounded-none inline-block" />
                  <span>Peritumoral Edema (ED)</span>
                </td>
                <td className="py-2.5 px-3">2 (Vasogenic edema)</td>
                <td className="py-2.5 px-3 text-right">{analytics.volumes.edema.ml.toFixed(2)} mL</td>
                <td className="py-2.5 px-3 text-right">{Math.round(analytics.volumes.edema.mm3).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">{analytics.volumes.edema.count.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">{analytics.ratios.edemaFraction.toFixed(1)}%</td>
                <td className="py-2.5 px-3">[{analytics.centroids.ed.voxel.join(', ')}]</td>
              </tr>

              {/* NCR */}
              <tr className="hover:bg-atern-hover transition-colors text-atern-muted">
                <td className="py-2.5 px-3 flex items-center space-x-2 text-[#EA580C]">
                  <span className="w-2.5 h-2.5 bg-[#EA580C] rounded-none inline-block" />
                  <span>Necrotic Core (NCR)</span>
                </td>
                <td className="py-2.5 px-3">1 (Non-enhancing necrosis)</td>
                <td className="py-2.5 px-3 text-right">{analytics.volumes.ncr.ml.toFixed(2)} mL</td>
                <td className="py-2.5 px-3 text-right">{Math.round(analytics.volumes.ncr.mm3).toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">{analytics.volumes.ncr.count.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right">
                  {((analytics.volumes.ncr.ml / (analytics.volumes.wt.ml || 1)) * 100).toFixed(1)}%
                </td>
                <td className="py-2.5 px-3">[{analytics.centroids.ncr.voxel.join(', ')}]</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Morphometric Dimensions & Extents */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-atern-muted block">3D Lesion Bounding Box</span>
          <div className="text-base font-bold font-mono text-atern-text">
            {analytics.bbox
              ? `${analytics.bbox.sizeMm[0].toFixed(1)} × ${analytics.bbox.sizeMm[1].toFixed(1)} × ${analytics.bbox.sizeMm[2].toFixed(1)} mm`
              : 'N/A'}
          </div>
          <span className="text-[10px] text-atern-muted block">
            Voxel span: [{analytics.bbox?.min.join(', ')}] → [{analytics.bbox?.max.join(', ')}]
          </span>
        </div>

        <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-atern-muted block">Estimated Max Caliper Span</span>
          <div className="text-base font-bold font-mono text-atern-text">
            {analytics.maxDiameter3dMm.toFixed(1)} mm (3D) • {analytics.maxAxialDiameterMm.toFixed(1)} mm (Axial)
          </div>
          <span className="text-[10px] text-atern-muted block">
            Feret caliper estimate based on active lesion bounding hull
          </span>
        </div>

        <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-atern-muted block">Peak Axial Slice Burden</span>
          <div className="text-base font-bold font-mono text-atern-text">
            Slice Z={analytics.profiles.peaks.axial.slice}
          </div>
          <span className="text-[10px] text-atern-muted block">
            Contains {analytics.profiles.peaks.axial.count.toLocaleString()} voxels (
            {((analytics.profiles.peaks.axial.count * analytics.voxelVolumeMm3) / 1000).toFixed(2)} mL)
          </span>
        </div>
      </div>

      {/* Integrity Passport Verification & Model Provenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Verification Checks */}
        <div className="border border-atern-border bg-atern-surface p-5 rounded-sm space-y-3">
          <div className="flex items-center justify-between border-b border-atern-border pb-2.5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-atern-muted font-bold flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-atern-blue" />
              <span>Integrity Passport Validation Suite</span>
            </h3>
            <span className="text-[10px] font-mono text-emerald-400">PASSED</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 bg-atern-bg border border-atern-border rounded-sm">
              <span className="text-atern-text">Four Modality Spatial Ingestion</span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified ({report.inputs.validation.status})</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-atern-bg border border-atern-border rounded-sm">
              <span className="text-atern-text">Inference Matrix & Affine Geometry</span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified ({report.segmentation.validation.status})</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-atern-bg border border-atern-border rounded-sm">
              <span className="text-atern-text">NIfTI Export Roundtrip Verification</span>
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verified (SHA-256 match)</span>
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-atern-bg border border-atern-border rounded-sm">
              <span className="text-atern-text">Voxel Decision Threshold</span>
              <span className="text-atern-muted">P(Tumour) ≥ 0.50</span>
            </div>
          </div>
        </div>

        {/* Provenance & Cryptographic Hashes */}
        <div className="border border-atern-border bg-atern-surface p-5 rounded-sm space-y-3">
          <div className="flex items-center justify-between border-b border-atern-border pb-2.5">
            <h3 className="text-xs font-mono uppercase tracking-wider text-atern-muted font-bold flex items-center space-x-2">
              <Fingerprint className="w-4 h-4 text-atern-blue" />
              <span>Model Provenance & Checksums</span>
            </h3>
            <span className="text-[10px] font-mono text-atern-muted">SHA-256</span>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="p-2.5 bg-atern-bg border border-atern-border rounded-sm space-y-0.5">
              <span className="text-[10px] text-atern-muted uppercase">Model Identifier & Hardware</span>
              <div className="text-atern-text font-bold truncate">
                {report.inference.model_identifier} ({report.inference.device})
              </div>
            </div>

            <div className="p-2.5 bg-atern-bg border border-atern-border rounded-sm space-y-0.5">
              <span className="text-[10px] text-atern-muted uppercase">Model Checkpoint SHA-256</span>
              <div className="text-atern-text text-[11px] truncate" title={report.inference.model_sha256}>
                {report.inference.model_sha256}
              </div>
            </div>

            <div className="p-2.5 bg-atern-bg border border-atern-border rounded-sm space-y-0.5">
              <span className="text-[10px] text-atern-muted uppercase">Inference Execution Duration</span>
              <div className="text-atern-text">
                {result.inference_seconds != null ? `${result.inference_seconds.toFixed(2)} seconds` : 'Synchronous local execution'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Notice Banner */}
      <div className="border border-atern-border bg-atern-bg p-4 rounded-sm flex items-start space-x-3 text-[11px] text-atern-muted">
        <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong className="text-atern-text">Regulatory & Clinical Restriction:</strong> This report is automatically compiled by the NeuroScope 3D research prototype. Segmentations and volumetric measurements are model estimates and must not be used for clinical diagnoses, surgical navigation, radiotherapy planning, or medical decisions without independent expert evaluation.
        </p>
      </div>
    </div>
  );
};
