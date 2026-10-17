import React, { useState } from 'react';
import { ModalityFile, ModalityType, UploadSlotsState } from '../../types';
import { ModalityCard } from './ModalityCard';
import { ShieldCheck, ChevronDown, ChevronUp, ArrowRight, CheckCircle2 } from 'lucide-react';

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

  // File assignment with intelligent name heuristic suggestion (which user can change/confirm)
  const handleFileSelect = (modality: ModalityType, file: File) => {
    // Quick heuristic to detect if user might have dropped a file in the wrong slot
    const lowerName = file.name.toLowerCase();
    let warning: string | undefined = undefined;

    if (modality === 't1' && (lowerName.includes('t1ce') || lowerName.includes('t1gd') || lowerName.includes('flair') || lowerName.includes('t2'))) {
      warning = `Warning: Filename "${file.name}" suggests this may not be native T1. Please verify.`;
    } else if (modality === 't1gd' && (!lowerName.includes('t1ce') && !lowerName.includes('t1gd') && !lowerName.includes('gd') && !lowerName.includes('ce') && (lowerName.includes('t2') || lowerName.includes('flair')))) {
      warning = `Warning: Filename "${file.name}" suggests this may not be contrast-enhanced T1Gd.`;
    } else if (modality === 'flair' && (lowerName.includes('t1') || lowerName.includes('t2') && !lowerName.includes('flair'))) {
      warning = `Warning: Filename "${file.name}" does not appear to be FLAIR sequence.`;
    }

    setSlots(prev => ({
      ...prev,
      [modality]: {
        file,
        name: file.name,
        size: file.size,
        status: 'selected',
        errorMessage: warning,
      }
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
      }
    }));
  };

  // 4 required modalities must be present
  const requiredModalitiesFilled = !!(
    slots.t1.file &&
    slots.t1gd.file &&
    slots.t2.file &&
    slots.flair.file
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requiredModalitiesFilled) return;
    onStartSegmentation(slots);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-8 animate-fade-in">
      {/* Hero / Header Section */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Explore a brain MRI in <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">3D</span>
        </h1>
        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          Upload four co-registered MRI sequences to view suspected tumour regions predicted by the model, estimated volumes, and input/output integrity checks.
        </p>

        {/* Data handling and backend status */}
        <div className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-neuro-900 border border-neuro-800 text-xs text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
          <span>
            {isBackendConnected
              ? 'Cases are stored locally by the backend and removed within 24 hours.'
              : 'Backend is unreachable or CORS blocked. Start FastAPI on port 8000 and allow this Vite origin (port 5173).'}
          </span>
        </div>
      </div>

      {/* Main 4-Modality Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <span>Required Co-Registered Modalities (4)</span>
            <span className="text-[11px] font-normal text-slate-400 font-mono">
              ({[slots.t1, slots.t1gd, slots.t2, slots.flair].filter(s => s.file).length}/4 selected)
            </span>
          </h2>
          <span className="text-xs text-slate-400">.nii / .nii.gz · 64 MiB per file · 128 MiB total</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModalityCard
            modality="t1"
            title="T1-Weighted"
            badge="T1"
            description="T1-weighted MRI sequence for this case."
            clinicalNote="Provided to the configured model as the T1 input channel."
            modalityFile={slots.t1}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t1gd"
            title="T1Gd (Contrast-Enhanced)"
            badge="T1Gd / T1CE"
            description="T1 MRI sequence acquired after contrast agent, if applicable."
            clinicalNote="Provided to the configured model as the T1ce input channel; this UI does not interpret enhancement."
            modalityFile={slots.t1gd}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="t2"
            title="T2-Weighted"
            badge="T2"
            description="T2-weighted MRI sequence for this case."
            clinicalNote="Provided to the configured model as the T2 input channel."
            modalityFile={slots.t2}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
          <ModalityCard
            modality="flair"
            title="FLAIR"
            badge="FLAIR"
            description="FLAIR MRI sequence for this case."
            clinicalNote="Provided to the configured model as the FLAIR input channel."
            modalityFile={slots.flair}
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
          />
        </div>
      </div>

      {/* Collapsed Optional Expert Reference Mask */}
      <div className="border border-neuro-800 rounded-xl bg-neuro-900/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowReferenceSection(!showReferenceSection)}
          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-neuro-900/60 transition-colors"
        >
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-semibold text-slate-300">
              Compare with an expert mask (optional)
            </span>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
              BraTS Codes: 1 NCR, 2 ED, 4 ET
            </span>
          </div>
          {showReferenceSection ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showReferenceSection && (
          <div className="p-5 border-t border-neuro-800 space-y-3 bg-neuro-950/20">
            <p className="text-xs text-slate-400 leading-relaxed">
              Comparison is possible only when the reference mask shares identical dimensions and spatial affine geometry with the four MRI volumes. When provided, case-specific Dice overlap will be evaluated.
            </p>
            <div className="max-w-xl">
              <ModalityCard
                modality="reference_mask"
                title="Expert Ground-Truth Mask"
                badge="REF MASK"
                description="Manual expert segmentation with BraTS 2021 label encoding."
                clinicalNote="Optional benchmark verification only. Never required to execute model."
                modalityFile={slots.reference_mask}
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                isOptional
              />
            </div>
          </div>
        )}
      </div>

      {/* Validation Summary and Primary Action Bar */}
      <div className="p-5 rounded-2xl bg-neuro-900 border border-neuro-800 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status indicator note */}
        <div className="space-y-1 text-center md:text-left">
          <div className="text-xs font-semibold text-slate-200 flex items-center justify-center md:justify-start space-x-2">
            <span>Validation Summary:</span>
            {requiredModalitiesFilled ? (
              <span className="text-emerald-400 flex items-center space-x-1 font-mono text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Four required files selected; server validation is still required</span>
              </span>
            ) : (
              <span className="text-slate-400 font-mono text-xs">
                Please provide all 4 sequences (T1, T1Gd, T2, FLAIR)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Backend will verify NIfTI geometry, finite intensities, and spatial orientation before running segmentation.
          </p>
        </div>

        {/* Submit validated modalities to the backend */}
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!requiredModalitiesFilled || !isBackendConnected}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-2 ${
              requiredModalitiesFilled && isBackendConnected
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-neuro-950 font-bold shadow-lg shadow-cyan-500/25 cursor-pointer'
                : 'bg-neuro-800 text-slate-500 border border-neuro-800 cursor-not-allowed'
            }`}
          >
            <span>Upload and run segmentation</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
