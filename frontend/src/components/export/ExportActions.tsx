import React, { useState } from 'react';
import type { SegmentationResult } from '../../types';
import { apiService } from '../../services/api';
import { AlertCircle, Download, FileJson, Loader2, RotateCcw } from 'lucide-react';

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
  const [downloading, setDownloading] = useState<'mask' | 'report' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (kind: 'mask' | 'report') => {
    setError(null);
    setDownloading(kind);
    try {
      const blob = kind === 'mask'
        ? await apiService.downloadMask(result.case_id)
        : await apiService.downloadReport(result.case_id);
      saveBlob(blob, kind === 'mask'
        ? `${result.case_id}_seg.nii.gz`
        : `${result.case_id}_integrity_report.json`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="bg-neuro-900 rounded-2xl border border-neuro-800 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center sm:text-left">
          <h4 className="text-sm font-bold text-slate-100">Export results</h4>
          <p className="text-[11px] text-slate-400">
            Download the model-predicted NIfTI label map and the JSON Integrity Passport.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-end">
          <button
            type="button"
            onClick={() => void download('mask')}
            disabled={downloading !== null}
            className="px-4 py-2.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-neuro-700 text-slate-200 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {downloading === 'mask' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-cyan-400" />}
            Download mask (.nii.gz)
          </button>
          <button
            type="button"
            onClick={() => void download('report')}
            disabled={downloading !== null}
            className="px-4 py-2.5 rounded-xl bg-neuro-850 hover:bg-neuro-800 border border-neuro-700 text-slate-200 text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {downloading === 'report' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5 text-cyan-400" />}
            Download report (.json)
          </button>
          <button
            type="button"
            onClick={onStartNewCase}
            className="px-4 py-2.5 rounded-xl bg-red-950/40 hover:bg-red-950/70 border border-red-800/60 text-red-300 text-xs font-semibold flex items-center gap-2"
            title="Delete this case from the backend and return to the upload form"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Delete case and start new
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
