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
    <div className="bg-[#0A0A0A] rounded border border-[#222222] p-4 space-y-3 font-sans">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="space-y-0.5 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <h4 className="text-xs font-semibold text-white tracking-tight">
              Export & Download Artifacts
            </h4>
            <span className="text-[10px] font-mono text-neutral-400 bg-[#141414] border border-[#262626] px-1.5 py-0.5 rounded">
              PDF • CSV • NIfTI • JSON
            </span>
          </div>
          <p className="text-[11px] text-neutral-500">
            Download clinical PDF reports, structured CSV metrics, or raw NIfTI label masks.
          </p>
        </div>

        {/* Action Buttons Group */}
        <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-end">
          {/* Download PDF Report: Vercel Signature Solid White */}
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading !== null}
            className="px-3.5 py-1.5 rounded bg-white hover:bg-neutral-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            title="Download formatted clinical and volumetric analysis report as PDF"
          >
            {downloading === 'pdf' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>PDF Report</span>
          </button>

          {/* Download CSV Report */}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={downloading !== null}
            className="px-3 py-1.5 rounded bg-[#111111] hover:bg-[#1A1A1A] border border-[#262626] hover:border-[#333333] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download structured spreadsheet report with all volumetric metrics"
          >
            {downloading === 'csv' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>CSV Table</span>
          </button>

          {/* Download Mask (.nii.gz) */}
          <button
            type="button"
            onClick={downloadMask}
            disabled={downloading !== null}
            className="px-3 py-1.5 rounded bg-[#111111] hover:bg-[#1A1A1A] border border-[#222222] hover:border-[#333333] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download 3D verified NIfTI label mask (.nii.gz)"
          >
            {downloading === 'mask' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-neutral-400" />
            )}
            <span>Mask (.nii.gz)</span>
          </button>

          {/* Download JSON Passport */}
          <button
            type="button"
            onClick={downloadJson}
            disabled={downloading !== null}
            className="px-2.5 py-1.5 rounded bg-[#111111] hover:bg-[#1A1A1A] border border-[#222222] text-neutral-400 hover:text-white text-xs font-mono transition-colors disabled:opacity-50 cursor-pointer"
            title="Download raw Integrity Passport JSON for audit trail"
          >
            {downloading === 'json' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileJson className="w-3.5 h-3.5" />
            )}
            <span>JSON</span>
          </button>

          {/* Delete case and start new */}
          <button
            type="button"
            onClick={onStartNewCase}
            className="px-3 py-1.5 rounded bg-[#111111] hover:bg-[#1A1A1A] border border-[#222222] text-neutral-400 hover:text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Purge active study and return to upload form"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded bg-[#160B0B] border border-red-900/40 text-xs text-red-300 flex items-center gap-2 font-mono">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default ExportActions;
