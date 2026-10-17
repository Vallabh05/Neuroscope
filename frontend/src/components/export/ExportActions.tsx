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
    <div className="bg-atern-surface rounded-sm border border-atern-border p-4 space-y-3 font-mono">
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="space-y-0.5 text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-atern-text">
              Clinical Export & Verification Artifacts
            </h4>
            <span className="text-[10px] text-atern-blue bg-atern-bg border border-atern-border px-1.5 py-0.2">
              PDF • CSV • NIfTI • JSON
            </span>
          </div>
          <p className="text-[11px] text-atern-muted">
            Export structured volumetric clinical reports, metric tables, or raw NIfTI label masks.
          </p>
        </div>

        {/* Action Buttons Group */}
        <div className="flex flex-wrap items-center gap-2 justify-center lg:justify-end">
          {/* Download PDF */}
          <button
            type="button"
            onClick={downloadPdf}
            disabled={downloading !== null}
            className="px-3.5 py-1.5 rounded-sm bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download formatted clinical PDF report"
          >
            {downloading === 'pdf' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5" />
            )}
            <span>PDF Report</span>
          </button>

          {/* Download CSV */}
          <button
            type="button"
            onClick={downloadCsv}
            disabled={downloading !== null}
            className="px-3.5 py-1.5 rounded-sm bg-atern-bg hover:bg-atern-hover border border-emerald-600/50 text-emerald-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download structured spreadsheet metrics as CSV"
          >
            {downloading === 'csv' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>CSV Table</span>
          </button>

          {/* Download Mask */}
          <button
            type="button"
            onClick={downloadMask}
            disabled={downloading !== null}
            className="px-3 py-1.5 rounded-sm bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-text text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download verified NIfTI label mask (.nii.gz)"
          >
            {downloading === 'mask' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5 text-atern-blue" />
            )}
            <span>Mask (.nii.gz)</span>
          </button>

          {/* Download JSON Passport */}
          <button
            type="button"
            onClick={downloadJson}
            disabled={downloading !== null}
            className="px-2.5 py-1.5 rounded-sm bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-muted hover:text-atern-text text-xs uppercase tracking-wider flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            title="Download raw Integrity Passport JSON"
          >
            {downloading === 'json' ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <FileJson className="w-3 h-3" />
            )}
            <span>JSON</span>
          </button>

          {/* New Case */}
          <button
            type="button"
            onClick={onStartNewCase}
            className="px-3 py-1.5 rounded-sm bg-atern-bg hover:bg-red-950/30 border border-red-800/40 text-red-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Reset and start new case"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Case</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-2.5 rounded-none bg-red-950/20 border border-red-800/40 text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
