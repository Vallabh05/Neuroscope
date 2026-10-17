import React, { useState } from 'react';
import { ModalityType, UploadSlotsState } from '../../types';
import { ModalityCard } from './ModalityCard';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RotateCcw,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface UploadWorkspaceProps {
  onStartSegmentation: (files: UploadSlotsState) => void;
  isBackendConnected: boolean;
  hasActiveCase?: boolean;
  activeCaseId?: string | null;
  onOpenWorkstation?: () => void;
  onResetCase?: () => void;
}

export const UploadWorkspace: React.FC<UploadWorkspaceProps> = ({
  onStartSegmentation,
  isBackendConnected,
  hasActiveCase,
  activeCaseId,
  onOpenWorkstation,
  onResetCase,
}) => {
  const [slots, setSlots] = useState<UploadSlotsState>({
    t1: { file: null, name: '', size: 0, status: 'not_selected' },
    t1gd: { file: null, name: '', size: 0, status: 'not_selected' },
    t2: { file: null, name: '', size: 0, status: 'not_selected' },
    flair: { file: null, name: '', size: 0, status: 'not_selected' },
    reference_mask: { file: null, name: '', size: 0, status: 'not_selected' },
  });

  const [showReferenceSection, setShowReferenceSection] = useState(false);

  const handleFileSelect = (modality: ModalityType, file: File) => {
    const lowerName = file.name.toLowerCase();
    let warning: string | undefined = undefined;

    if (
      modality === 't1' &&
      (lowerName.includes('t1ce') ||
        lowerName.includes('t1gd') ||
        lowerName.includes('flair') ||
        lowerName.includes('t2'))
    ) {
      warning = `Note: Filename suggests this may not be native T1. Please verify channel.`;
    } else if (
      modality === 't1gd' &&
      !lowerName.includes('t1ce') &&
      !lowerName.includes('t1gd') &&
      !lowerName.includes('gd') &&
      !lowerName.includes('ce') &&
      (lowerName.includes('t2') || lowerName.includes('flair'))
    ) {
      warning = `Note: Filename suggests this may not be contrast-enhanced T1Gd.`;
    } else if (
      modality === 'flair' &&
      (lowerName.includes('t1') || (lowerName.includes('t2') && !lowerName.includes('flair')))
    ) {
      warning = `Note: Filename does not appear to be FLAIR sequence.`;
    }

    setSlots(prev => ({
      ...prev,
      [modality]: {
        file,
        name: file.name,
        size: file.size,
        status: 'selected',
        errorMessage: warning,
      },
    }));
  };

  const handleFileRemove = (modality: ModalityType) => {
    setSlots(prev => ({
      ...prev,
      [modality]: {
        file: null,
        name: '',
        size: 0,
        status: 'not_selected',
        errorMessage: undefined,
      },
    }));
  };

  const requiredModalitiesFilled = !!(
    slots.t1.file &&
    slots.t1gd.file &&
    slots.t2.file &&
    slots.flair.file
  );

  const selectedCount = [slots.t1, slots.t1gd, slots.t2, slots.flair].filter(s => s.file).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requiredModalitiesFilled) return;
    onStartSegmentation(slots);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-6 animate-fade-in">
      {/* Existing Case Notice Banner (if active) */}
      {hasActiveCase && activeCaseId && (
        <div className="border border-atern-blue bg-atern-surface p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-atern-blue" />
            <div>
              <span className="text-xs font-mono font-bold text-atern-text uppercase">
                Active Study In Memory: {activeCaseId}
              </span>
              <p className="text-[11px] text-atern-muted">
                A segmented case is currently loaded in the workstation. You can reopen it or configure new MRI sequences below.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenWorkstation && (
              <button
                type="button"
                onClick={onOpenWorkstation}
                className="px-3.5 py-1.5 bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-mono font-semibold uppercase tracking-wider rounded-sm transition-colors cursor-pointer"
              >
                Reopen Workstation
              </button>
            )}
            {onResetCase && (
              <button
                type="button"
                onClick={onResetCase}
                className="px-3 py-1.5 bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-muted hover:text-atern-text text-xs font-mono uppercase tracking-wider rounded-sm transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Case Ingestion Header */}
      <div className="border border-atern-border bg-atern-surface p-6 rounded-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-atern-border pb-3">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-tight text-atern-text font-mono">
              Cases: MRI Sequence Ingestion
            </h1>
            <p className="text-xs text-atern-muted mt-0.5">
              Supply four co-registered NIfTI series to initialize spatial alignment and volumetric model inference.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-atern-bg border border-atern-border text-atern-muted">
              Format: .nii / .nii.gz
            </span>
          </div>
        </div>

        {/* Technical specs pill */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono text-atern-muted">
          <span className="flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-atern-blue" />
            <span>Local session storage only</span>
          </span>
          <span>•</span>
          <span>Automatic purge in 24 hours</span>
          <span>•</span>
          <span>128 MiB session limit</span>
        </div>
      </div>

      {/* 4 Modalities Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono uppercase text-atern-muted">
          <span className="font-bold tracking-wider">
            Required Multi-Parametric Modalities ({selectedCount}/4 Selected)
          </span>
          <span className="text-[11px]">BraTS 2021 Input Channels</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModalityCard
            modality="t1"
            title="T1-Weighted Native"
            badge="T1"
            description="Native T1-weighted structural anatomical sequence."
            clinicalNote="Mapped directly to model input channel 0."
            modalityFile={slots.t1}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t1gd"
            title="T1Gd Contrast-Enhanced"
            badge="T1GD / T1CE"
            description="Post-gadolinium contrast-enhanced T1 sequence."
            clinicalNote="Mapped directly to model input channel 1 (active angiogenesis)."
            modalityFile={slots.t1gd}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t2"
            title="T2-Weighted"
            badge="T2"
            description="T2-weighted spin-echo sequence reflecting tissue fluid."
            clinicalNote="Mapped directly to model input channel 2."
            modalityFile={slots.t2}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="flair"
            title="FLAIR Inversion Recovery"
            badge="FLAIR"
            description="Fluid-Attenuated Inversion Recovery sequence."
            clinicalNote="Mapped directly to model input channel 3 (vasogenic edema)."
            modalityFile={slots.flair}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
        </div>
      </div>

      {/* Collapsible Expert Reference Mask Section */}
      <div className="border border-atern-border rounded-sm bg-atern-surface overflow-hidden">
        <button
          type="button"
          onClick={() => setShowReferenceSection(!showReferenceSection)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-atern-hover transition-colors cursor-pointer"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-atern-text">
              Expert Benchmark Reference Mask (Optional)
            </span>
            <span className="text-[10px] font-mono text-atern-blue bg-atern-bg border border-atern-border px-1.5 py-0.2">
              BraTS Codes: 1 NCR, 2 ED, 4 ET
            </span>
          </div>
          {showReferenceSection ? (
            <ChevronUp className="w-4 h-4 text-atern-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-atern-muted" />
          )}
        </button>

        {showReferenceSection && (
          <div className="p-4 border-t border-atern-border space-y-3 bg-atern-bg">
            <p className="text-xs text-atern-muted leading-relaxed">
              When an expert ground-truth mask is provided, the platform automatically evaluates per-case Dice overlap and sensitivity metrics against model predictions.
            </p>
            <div className="max-w-xl">
              <ModalityCard
                modality="reference_mask"
                title="Expert Ground-Truth Mask"
                badge="REF MASK"
                description="Manual expert segmentation for benchmarking."
                clinicalNote="Optional per-case Dice validation only; never required to execute segmentation."
                modalityFile={slots.reference_mask}
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                isOptional
              />
            </div>
          </div>
        )}
      </div>

      {/* Validation Summary and Primary Execution Button */}
      <div className="border border-atern-border bg-atern-surface p-5 rounded-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <div className="text-xs font-mono font-bold uppercase tracking-wider text-atern-text flex items-center justify-center md:justify-start space-x-2">
            <span>Validation Status:</span>
            {requiredModalitiesFilled ? (
              <span className="text-emerald-400 flex items-center space-x-1 font-mono text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>4 Required Channels Ready</span>
              </span>
            ) : (
              <span className="text-atern-muted font-mono text-xs">
                Select T1, T1Gd, T2, and FLAIR series
              </span>
            )}
          </div>
          <p className="text-[11px] text-atern-muted">
            FastAPI validates spatial affine matrix, voxel spacing, and intensity integrity prior to SegResNet inference.
          </p>
        </div>

        {/* Primary Action Button */}
        <div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!requiredModalitiesFilled || !isBackendConnected}
            className={`px-6 py-2.5 text-xs font-mono font-bold uppercase tracking-wider rounded-sm flex items-center justify-center space-x-2 transition-colors ${
              requiredModalitiesFilled && isBackendConnected
                ? 'bg-atern-blue hover:bg-atern-blue-hover text-white cursor-pointer'
                : 'bg-atern-bg text-atern-muted border border-atern-border cursor-not-allowed'
            }`}
          >
            <span>Run Segmentation Pipeline</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
