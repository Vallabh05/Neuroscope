import React, { useState } from 'react';
import type { SegmentationResult } from '../../types';
import { apiService } from '../../services/api';
import { generatePdfReport, generateCsvReport } from '../../utils/reportGenerators';
import {
  AlertCircle,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  RotateCcw,
} from 'lucide-react';

interface ExportActionsProps {
  result: SegmentationResult;
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

export const ExportActions: React.FC<ExportActionsProps> = ({
  result,
  onStartNewCase,
}) => {
  const [downloading, setDownloading] = useState<'mask' | 'json' | 'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadMask = async () => {
    setError(null);
    setDownloading('mask');
    try {
      const blob = await apiService.downloadMask(result.case_id);
      saveBlob(blob, `${result.case_id}_seg.nii.gz`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mask download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadJson = async () => {
    setError(null);
    setDownloading('json');
    try {
      const blob = await apiService.downloadReport(result.case_id);
      saveBlob(blob, `${result.case_id}_integrity_report.json`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON download failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadPdf = () => {
    setError(null);
    setDownloading('pdf');
    try {
      generatePdfReport(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'PDF report generation failed.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadCsv = () => {
    setError(null);
    setDownloading('csv');
    try {
      generateCsvReport(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CSV report generation failed.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="bg-neuro-900 rounded-2xl border border-neuro-800 p-5 space-y-4 shadow-xl">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <h4 className="text-base font-bold text-slate-100">Export & Download Clinical Reports</h4>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded-full">
              PDF • CSV • NIfTI
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Download professional clinical PDF reports, structured CSV metrics, or raw NIfTI label masks.
          </p>
        </div>

        {/* Action Buttons Group */}
        <div className="flex flex-wrap items-center gap-2.5 justify-center lg:justify-end">
          {/* Download PDF Report */}
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading !== null}
            className="px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all hover:scale-[1.02] disabled:opacity-50"
            title="Download formatted clinical and volumetric analysis report as PDF"
          >
            {downloading === 'pdf' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Download PDF Report (.pdf)
          </button>

          {/* Download CSV Report */}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={downloading !== null}
            className="px-4 py-2.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-emerald-600/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            title="Download structured spreadsheet report with all volumetric metrics"
          >
            {downloading === 'csv' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            )}
            Download CSV (.csv)
          </button>

          {/* Download Mask (.nii.gz) */}
          <button
            type="button"
            onClick={downloadMask}
            disabled={downloading !== null}
            className="px-3.5 py-2.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-neuro-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            title="Download 3D verified NIfTI label mask (.nii.gz)"
          >
            {downloading === 'mask' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4 text-cyan-400" />
            )}
            Mask (.nii.gz)
          </button>

          {/* Download JSON Passport */}
          <button
            type="button"
            onClick={downloadJson}
            disabled={downloading !== null}
            className="px-3 py-2.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-neuro-750 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Download raw Integrity Passport JSON for audit trail"
          >
            {downloading === 'json' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileJson className="w-3.5 h-3.5 text-slate-400" />
            )}
            JSON
          </button>

          {/* Delete case and start new */}
          <button
            type="button"
            onClick={onStartNewCase}
            className="px-3.5 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-950/70 border border-red-800/60 text-red-300 text-xs font-semibold flex items-center gap-2 transition-colors"
            title="Delete this case from the backend and return to the upload form"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            New Case
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
};
