import React, { useState } from 'react';
import { ModalityType, UploadSlotsState } from '../../types';
import { ModalityCard } from './ModalityCard';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';

interface UploadWorkspaceProps {
  onStartSegmentation: (files: UploadSlotsState) => void;
  isBackendConnected: boolean;
}

export const UploadWorkspace: React.FC<UploadWorkspaceProps> = ({
  onStartSegmentation,
  isBackendConnected,
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
      warning = `Note: Filename suggests this may not be native T1. Please verify sequence.`;
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
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-6 animate-fade-in font-sans">
      {/* Vercel-style Clean Hero Section */}
      <div className="text-center max-w-2xl mx-auto space-y-3 pt-2 pb-2">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white font-sans">
          Volumetric Brain MRI Segmentation
        </h1>
        <p className="text-sm text-neutral-400 leading-relaxed font-sans">
          Upload four co-registered MRI sequences to compute predicted tumor regions, volumetric measurements, and geometric verification checks.
        </p>

        {/* Backend connectivity & ephemeral storage badge */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded bg-[#0A0A0A] border border-[#222222] text-xs text-neutral-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" />
          <span>
            {isBackendConnected
              ? 'Local daemon active • In-memory processing • Session auto-purged'
              : 'Backend daemon unreachable on 127.0.0.1:8000. Start FastAPI server to continue.'}
          </span>
        </div>
      </div>

      {/* Main 4-Modality Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span className="font-semibold text-neutral-300 font-mono uppercase tracking-wider text-[11px]">
            Required MRI Modalities ({selectedCount}/4 selected)
          </span>
          <span className="font-mono text-[11px] text-neutral-500">
            Format: .nii / .nii.gz • Max 64 MiB/file
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <ModalityCard
            modality="t1"
            title="T1-Weighted"
            badge="T1"
            description="Native T1-weighted anatomical series."
            clinicalNote="Provided to SegResNet as input channel 0."
            modalityFile={slots.t1}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t1gd"
            title="T1Gd (Contrast-Enhanced)"
            badge="T1GD / T1CE"
            description="Post-contrast T1 sequence highlighting active tumor."
            clinicalNote="Provided to SegResNet as input channel 1 (active angiogenesis)."
            modalityFile={slots.t1gd}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t2"
            title="T2-Weighted"
            badge="T2"
            description="T2-weighted spin-echo anatomical sequence."
            clinicalNote="Provided to SegResNet as input channel 2."
            modalityFile={slots.t2}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="flair"
            title="FLAIR"
            badge="FLAIR"
            description="Fluid-Attenuated Inversion Recovery sequence."
            clinicalNote="Provided to SegResNet as input channel 3 (peritumoral edema)."
            modalityFile={slots.flair}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
        </div>
      </div>

      {/* Collapsed Optional Expert Reference Mask */}
      <div className="border border-[#222222] rounded bg-[#0A0A0A] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowReferenceSection(!showReferenceSection)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#111111] transition-colors cursor-pointer"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-medium text-neutral-300 font-sans">
              Compare with expert ground-truth mask (optional)
            </span>
            <span className="text-[10px] font-mono text-neutral-400 bg-[#141414] border border-[#262626] px-1.5 py-0.5 rounded">
              BraTS Codes: 1 NCR, 2 ED, 4 ET
            </span>
          </div>
          {showReferenceSection ? (
            <ChevronUp className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          )}
        </button>

        {showReferenceSection && (
          <div className="p-4 border-t border-[#222222] space-y-3 bg-[#000000]">
            <p className="text-xs text-neutral-400 leading-relaxed font-sans">
              Ground-truth masks require identical grid dimensions and spatial orientation to evaluate per-case Dice overlap and sensitivity metrics.
            </p>
            <div className="max-w-xl">
              <ModalityCard
                modality="reference_mask"
                title="Expert Ground-Truth Mask"
                badge="REF MASK"
                description="Manual expert segmentation for benchmarking."
                clinicalNote="Optional per-case verification; never required to execute inference."
                modalityFile={slots.reference_mask}
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                isOptional
              />
            </div>
          </div>
        )}
      </div>

      {/* Validation Summary & Vercel-Style Primary Execution Bar */}
      <div className="p-4 rounded bg-[#0A0A0A] border border-[#222222] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <div className="text-xs font-medium text-neutral-200 flex items-center justify-center md:justify-start space-x-2 font-sans">
            <span>Validation Status:</span>
            {requiredModalitiesFilled ? (
              <span className="text-emerald-400 flex items-center space-x-1 font-mono text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Four required series selected</span>
              </span>
            ) : (
              <span className="text-neutral-500 font-mono text-xs">
                Please provide all 4 sequences (T1, T1Gd, T2, FLAIR)
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-500 font-sans">
            FastAPI validates spatial affine matrix, coordinate space, and finite intensity bounds before model execution.
          </p>
        </div>

        {/* Primary Action Button: Vercel Signature Solid White */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!requiredModalitiesFilled || !isBackendConnected}
            className={`w-full md:w-auto px-5 py-2.5 rounded font-medium text-xs transition-colors flex items-center justify-center space-x-2 ${
              requiredModalitiesFilled && isBackendConnected
                ? 'bg-white hover:bg-neutral-200 text-black font-semibold shadow-sm cursor-pointer'
                : 'bg-[#141414] text-neutral-600 border border-[#222222] cursor-not-allowed'
            }`}
          >
            <span>Run Segmentation Pipeline</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadWorkspace;
