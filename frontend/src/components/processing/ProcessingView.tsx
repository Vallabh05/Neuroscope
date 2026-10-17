import React from 'react';
import { JobStage } from '../../types';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, XCircle, FileCheck, Cpu, Download } from 'lucide-react';

interface ProcessingViewProps {
  stage: JobStage;
  stageDescription: string;
  progressPercent?: number | null;
  error?: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

interface StageStep {
  id: JobStage;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const STAGES: StageStep[] = [
  {
    id: 'receiving_files',
    label: 'Uploading and validating inputs',
    desc: 'Sending the MRI volumes to FastAPI for NIfTI and geometry validation.',
    icon: <FileCheck className="w-4 h-4" />
  },
  {
    id: 'running_inference',
    label: 'Running model inference',
    desc: 'The backend runs its configured segmentation model synchronously.',
    icon: <Cpu className="w-4 h-4" />
  },
  {
    id: 'preparing_outputs',
    label: 'Validating and loading results',
    desc: 'The API validates the predicted mask, calculates region volumes, and writes a verified NIfTI mask and JSON report.',
    icon: <Download className="w-4 h-4" />
  }
];

export const ProcessingView: React.FC<ProcessingViewProps> = ({
  stage,
  stageDescription,
  progressPercent,
  error,
  onRetry,
  onCancel,
}) => {
  const currentStageIndex = STAGES.findIndex(s => s.id === stage);
  const isFailed = stage === 'failed' || !!error;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 space-y-8 animate-fade-in">
      <div className="p-8 rounded-2xl bg-neuro-900 border border-neuro-800 shadow-2xl shadow-cyan-950/20 space-y-6">
        {/* Top Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-2">
            {isFailed ? (
              <XCircle className="w-8 h-8 text-red-400" />
            ) : (
              <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            )}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isFailed ? 'Processing Failed' : 'Segmenting MRI Volumes'}
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {isFailed
              ? 'The request failed; the backend does not mark a failed case as successful.'
              : stageDescription || 'Segmentation is synchronous. This page waits for the FastAPI request to finish.'}
          </p>
        </div>

        {/* Progress Bar (Honest: Indeterminate or actual percentage) */}
        {!isFailed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono">
                {currentStageIndex >= 0 ? `Stage ${currentStageIndex + 1} of ${STAGES.length}` : 'Initializing pipeline...'}
              </span>
              <span className="font-mono text-cyan-400">
                {progressPercent != null ? `${Math.round(progressPercent)}%` : 'Active'}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neuro-950 border border-neuro-800 overflow-hidden">
              {progressPercent != null ? (
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              ) : (
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 w-1/3 animate-indeterminate rounded-full" />
              )}
            </div>
          </div>
        )}

        {/* Error Callout */}
        {isFailed && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs space-y-2">
            <div className="flex items-center space-x-2 font-semibold text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Pipeline Error Details</span>
            </div>
            <p className="font-mono text-[11px] bg-red-950/80 p-2.5 rounded border border-red-900/60 break-words">
              {error || 'Unknown server error encountered during image processing.'}
            </p>
            <p className="text-[11px] text-slate-400">
              Check that the four files belong to the same case and satisfy the backend validation requirements, then retry.
            </p>
          </div>
        )}

        {/* Pipeline Stage Checklist */}
        <div className="space-y-2 pt-2 border-t border-neuro-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Verification Pipeline Sequence
          </span>
          <div className="space-y-1.5">
            {STAGES.map((s, index) => {
              const isDone = currentStageIndex > index;
              const isCurrent = currentStageIndex === index && !isFailed;
              const isStageFailed = isFailed && currentStageIndex === index;

              return (
                <div
                  key={s.id}
                  className={`flex items-start space-x-3 p-2.5 rounded-lg text-xs transition-colors ${
                    isCurrent
                      ? 'bg-cyan-950/40 border border-cyan-800/60 text-white'
                      : isDone
                      ? 'bg-neuro-950/40 text-slate-300'
                      : isStageFailed
                      ? 'bg-red-950/30 border border-red-800/50 text-red-300'
                      : 'opacity-40 text-slate-400'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isStageFailed ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-slate-600 block" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200">{s.label}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="pt-4 border-t border-neuro-800 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-neuro-800 bg-neuro-850 hover:bg-neuro-800 text-slate-300 hover:text-white text-xs font-medium transition-colors"
          >
            Return to upload
          </button>
          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-950/50 transition-colors flex items-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Validation & Inference</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
