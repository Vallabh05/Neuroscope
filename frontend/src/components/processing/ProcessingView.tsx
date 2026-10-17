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
    label: 'Validating input series & spatial geometry',
    desc: 'Checking NIfTI dimensions, coordinate orientation, and finite voxel bounds.',
    icon: <FileCheck className="w-4 h-4" />,
  },
  {
    id: 'running_inference',
    label: 'Executing MONAI SegResNet neural inference',
    desc: 'Synchronous sliding-window segmentation across 4 multi-parametric MRI channels.',
    icon: <Cpu className="w-4 h-4" />,
  },
  {
    id: 'preparing_outputs',
    label: 'Integrating volumetric metrics & 3D surfaces',
    desc: 'Evaluating sub-compartment volumes, Marching Cubes label meshes, and checksums.',
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
    <div className="max-w-2xl mx-auto px-4 py-12 sm:px-6 space-y-6 animate-fade-in font-sans">
      <div className="p-6 sm:p-8 rounded bg-[#0A0A0A] border border-[#222222] space-y-6">
        {/* Top Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-2.5 rounded bg-[#111111] border border-[#222222] text-white mb-1">
            {isFailed ? (
              <XCircle className="w-6 h-6 text-red-400" />
            ) : (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-white tracking-tight font-sans">
            {isFailed ? 'Processing Failed' : 'Segmenting Multi-Parametric MRI Volumes'}
          </h2>
          <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
            {isFailed
              ? 'The request encountered a validation or execution failure on the backend daemon.'
              : stageDescription || 'Processing is synchronous on the local backend daemon.'}
          </p>
        </div>

        {/* Progress Bar (Vercel Clean White/Gray) */}
        {!isFailed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
              <span>
                {currentStageIndex >= 0
                  ? `Stage ${currentStageIndex + 1} of ${STAGES.length}`
                  : 'Initializing pipeline...'}
              </span>
              <span className="text-white font-medium">
                {progressPercent != null ? `${Math.round(progressPercent)}%` : 'Active'}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#111111] border border-[#222222] overflow-hidden">
              {progressPercent != null ? (
                <div
                  className="h-full bg-white transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                />
              ) : (
                <div className="h-full bg-white w-1/3 animate-indeterminate rounded-full" />
              )}
            </div>
          </div>
        )}

        {/* Error Callout */}
        {isFailed && (
          <div className="p-3.5 rounded bg-[#160B0B] border border-red-900/50 text-red-200 text-xs space-y-2 font-mono">
            <div className="flex items-center space-x-2 font-semibold text-red-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Pipeline Error Details</span>
            </div>
            <p className="bg-[#000000] p-2.5 rounded border border-red-950 break-words text-[11px]">
              {error || 'Unknown server error encountered during image processing.'}
            </p>
            <p className="text-[11px] text-neutral-400 font-sans">
              Verify that all four series share identical matrix dimensions and spatial orientation before retrying.
            </p>
          </div>
        )}

        {/* Pipeline Stage Checklist */}
        <div className="space-y-2 pt-1 border-t border-[#1C1C1C]">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 block mb-2">
            Verification Pipeline Sequence
          </span>
          <div className="space-y-1.5 font-sans">
            {STAGES.map((s, index) => {
              const isDone = currentStageIndex > index;
              const isCurrent = currentStageIndex === index && !isFailed;
              const isStageFailed = isFailed && currentStageIndex === index;

              return (
                <div
                  key={s.id}
                  className={`flex items-start space-x-3 p-2.5 rounded border transition-colors ${
                    isCurrent
                      ? 'bg-[#111111] border-[#333333] text-white'
                      : isDone
                      ? 'bg-[#000000] border-[#1C1C1C] text-neutral-300'
                      : isStageFailed
                      ? 'bg-[#160B0B] border-red-900/50 text-red-300'
                      : 'opacity-40 bg-[#000000] border-[#1C1C1C] text-neutral-500'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isStageFailed ? (
                      <XCircle className="w-4 h-4 text-red-400" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-neutral-700 block" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-xs text-white">{s.label}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5 leading-snug">{s.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="pt-3 border-t border-[#1C1C1C] flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded bg-[#111111] hover:bg-[#1A1A1A] border border-[#222222] hover:border-[#333333] text-neutral-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {isFailed && (
            <button
              type="button"
              onClick={onRetry}
              className="px-4 py-1.5 rounded bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer shadow-sm"
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

export default ProcessingView;
