import React from 'react';
import { AlertTriangle, BookOpen, Brain, Layers, ShieldAlert, X } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in font-mono">
      <div
        className="relative w-full max-w-2xl bg-atern-surface border border-atern-border rounded-sm shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-atern-border bg-atern-bg">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-sm bg-atern-blue text-white flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 id="modal-headline" className="text-xs font-bold uppercase tracking-wider text-atern-text">
                About NeuroScope 3D & Scientific Specifications
              </h2>
              <p className="text-[10px] text-atern-muted">Research Prototype • MONAI SegResNet Engine</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-atern-muted hover:text-atern-text hover:bg-atern-surface transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-4 text-xs font-mono text-atern-muted">
          {/* Regulatory Restriction Alert */}
          <div className="p-3 rounded-none bg-amber-950/20 border border-amber-800/40 text-amber-300 space-y-1">
            <div className="flex items-center space-x-2 font-bold uppercase tracking-wider text-[11px] text-amber-400">
              <ShieldAlert className="w-4 h-4" />
              <span>Non-Clinical Research Specification</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              NeuroScope 3D is strictly an educational and algorithmic benchmarking prototype. It has not received regulatory clearance.
              <strong className="text-amber-200"> Never use predicted masks or estimated volumes for medical treatment, surgical planning, or patient diagnostic decisions.</strong>
            </p>
          </div>

          {/* MRI Modalities Guide */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-atern-text uppercase tracking-wider flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-atern-blue" />
              <span>Multi-Parametric Input Modalities (BraTS 2021)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
                <span className="font-bold text-atern-text block uppercase">T1 Native</span>
                <span className="text-atern-muted leading-normal">
                  Channel 0: Native T1 structural anatomical sequence.
                </span>
              </div>
              <div className="p-2.5 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
                <span className="font-bold text-atern-text block uppercase">T1Gd Contrast</span>
                <span className="text-atern-muted leading-normal">
                  Channel 1: Post-gadolinium enhanced sequence capturing active tumor angiogenesis.
                </span>
              </div>
              <div className="p-2.5 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
                <span className="font-bold text-atern-text block uppercase">T2 Weighted</span>
                <span className="text-atern-muted leading-normal">
                  Channel 2: Spin-echo sequence capturing free water and tissue boundary differences.
                </span>
              </div>
              <div className="p-2.5 rounded-none bg-atern-bg border border-atern-border space-y-0.5">
                <span className="font-bold text-atern-text block uppercase">FLAIR Sequence</span>
                <span className="text-atern-muted leading-normal">
                  Channel 3: Inversion recovery sequence highlighting vasogenic peritumoral edema.
                </span>
              </div>
            </div>
          </div>

          {/* Sub-region Definitions */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-bold text-atern-text uppercase tracking-wider flex items-center space-x-1.5">
              <BookOpen className="w-3.5 h-3.5 text-atern-blue" />
              <span>Tumour Sub-Region Label Hierarchy</span>
            </h3>
            <div className="p-3 rounded-none bg-atern-bg border border-atern-border space-y-2 text-[11px]">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-none bg-[#D97706] flex-shrink-0" />
                <div>
                  <strong className="text-atern-text">Whole Tumour (WT):</strong> Labels 1 + 2 + 4. Comprehensive lesion volume including edema.
                </div>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-none bg-[#DC2626] flex-shrink-0" />
                <div>
                  <strong className="text-atern-text">Tumour Core (TC):</strong> Labels 1 + 4. Viable enhancing tissue plus central necrosis.
                </div>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-none bg-[#0284C7] flex-shrink-0" />
                <div>
                  <strong className="text-atern-text">Enhancing Tumour (ET):</strong> Label 4 only. Active angiogenic region with broken blood-brain barrier.
                </div>
              </div>
            </div>
          </div>

          {/* Technical Scope & Invariants */}
          <div className="space-y-1.5">
            <h3 className="text-[11px] font-bold text-atern-text uppercase tracking-wider flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-atern-blue" />
              <span>Engineering Assumptions & Boundary Limits</span>
            </h3>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-atern-muted">
              <li>Spatial coordinates correspond to the input NIfTI voxel grid and affine matrix transformation.</li>
              <li>Calculated volumes integrate direct voxel physical volume: V = N_voxels × |det(affine)| ÷ 1000 mL.</li>
              <li>Input series must be skull-stripped or pre-aligned to the BraTS coordinate system.</li>
              <li>Case data remains strictly on the host system within an ephemeral 24-hour cache.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-atern-border bg-atern-bg flex items-center justify-between text-xs text-atern-muted">
          <span>BraTS 2021 Reference Architecture</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-sm bg-atern-blue hover:bg-atern-blue-hover text-white font-bold uppercase tracking-wider transition-colors cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};
