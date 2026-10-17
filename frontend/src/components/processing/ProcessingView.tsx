import React from 'react';
import { JobStage } from '../../types';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FileCheck,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';

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
    label: 'Stage 01: Ingestion & Spatial Geometry Check',
    desc: 'Verifying NIfTI header, grid dimensions, and finite intensity bounds on FastAPI daemon.',
    icon: <FileCheck className="w-4 h-4" />,
  },
  {
    id: 'running_inference',
    label: 'Stage 02: MONAI SegResNet Neural Inference',
    desc: 'Executing synchronous inference across 4 co-registered channels with sigmoid probability thresholding.',
    icon: <Cpu className="w-4 h-4" />,
  },
  {
    id: 'preparing_outputs',
    label: 'Stage 03: Metric Integration & Mask Export',
    desc: 'Validating output label geometry, computing voxel integrals, and loading 3D surface meshes.',
    icon: <Download className="w-4 h-4" />,
  },
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
    <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 space-y-6 animate-fade-in">
      <div className="p-6 sm:p-8 rounded-sm bg-atern-surface border border-atern-border space-y-6">
        {/* Top Header */}
        <div className="space-y-2 border-b border-atern-border pb-5">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 bg-atern-blue" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-atern-muted">
              Processing Pipeline
            </span>
          </div>
          <h2 className="text-lg font-bold uppercase tracking-tight text-atern-text font-mono">
            {isFailed ? 'Pipeline Execution Failed' : 'Segmenting MRI Multi-Parametric Series'}
          </h2>
          <p className="text-xs text-atern-muted">
            {isFailed
              ? 'The request encountered a validation or execution failure. A failed case is never marked as valid.'
              : stageDescription || 'Synchronous execution in progress on the local backend daemon.'}
          </p>
        </div>

        {/* Progress Bar (Flat technical blue) */}
        {!isFailed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-atern-muted">
              <span>
                {currentStageIndex >= 0
                  ? `STAGE ${currentStageIndex + 1} OF ${STAGES.length}`
                  : 'INITIALIZING PIPELINE...'}
              </span>
              <span className="text-atern-blue font-bold">
                {progressPercent != null ? `${Math.round(progressPercent)}%` : 'EXECUTING'}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-none bg-atern-bg border border-atern-border overflow-hidden">
              {progressPercent != null ? (
                <div
                  className="h-full bg-atern-blue transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              ) : (
                <div className="h-full bg-atern-blue w-1/3 animate-indeterminate" />
              )}
            </div>
          </div>
        )}

        {/* Error Callout */}
        {isFailed && (
          <div className="p-4 rounded-sm bg-red-950/20 border border-red-800/50 text-red-200 text-xs space-y-2 font-mono">
            <div className="flex items-center space-x-2 font-bold text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="uppercase tracking-wider">Pipeline Error Reported</span>
            </div>
            <p className="bg-atern-bg p-2.5 rounded-none border border-red-900/60 break-words text-[11px]">
              {error || 'Unknown server error encountered during image processing.'}
            </p>
            <p className="text-[11px] text-atern-muted">
              Verify that all four series share identical matrix dimensions and spatial orientation before retrying.
            </p>
          </div>
        )}

        {/* Pipeline Stage Checklist */}
        <div className="space-y-2 pt-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-atern-muted block mb-2">
            Execution Stages
          </span>
          <div className="space-y-2 font-mono">
            {STAGES.map((s, index) => {
              const isDone = currentStageIndex > index;
              const isCurrent = currentStageIndex === index && !isFailed;
              const isStageFailed = isFailed && currentStageIndex === index;

              return (
                <div
                  key={s.id}
                  className={`flex items-start space-x-3 p-3 rounded-sm border transition-colors ${
                    isCurrent
                      ? 'bg-atern-bg border-atern-blue text-atern-text'
                      : isDone
                      ? 'bg-atern-bg border-atern-border text-atern-muted'
                      : isStageFailed
                      ? 'bg-red-950/20 border-red-800/40 text-red-300'
                      : 'opacity-40 bg-atern-bg border-atern-border text-atern-muted'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isStageFailed ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-atern-blue animate-spin" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-none border border-atern-border block" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs uppercase tracking-wider text-atern-text">
                      {s.label}
                    </div>
                    <div className="text-[11px] text-atern-muted mt-0.5 leading-snug font-sans">
                      {s.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="pt-4 border-t border-atern-border flex items-center justify-end space-x-3 font-mono">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-sm border border-atern-border bg-atern-bg hover:bg-atern-hover text-atern-muted hover:text-atern-text text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Cancel / Return
          </button>
          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2 rounded-sm bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-bold uppercase tracking-wider transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Pipeline</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
