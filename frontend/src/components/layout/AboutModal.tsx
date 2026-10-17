import React from 'react';
import { AlertTriangle, BookOpen, Brain, Layers, ShieldAlert, X } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fade-in font-sans">
      <div
        className="relative w-full max-w-2xl bg-[#0A0A0A] border border-[#222222] rounded-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-headline"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1C1C1C] bg-[#000000]">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded bg-white text-black flex items-center justify-center font-bold">
              <Brain className="w-4 h-4 text-black" strokeWidth={2.2} />
            </div>
            <div>
              <h2 id="modal-headline" className="text-xs font-semibold text-white tracking-tight uppercase font-mono">
                About NeuroScope 3D & Technical Specifications
              </h2>
              <p className="text-[11px] text-neutral-500 font-sans">Research Prototype • MONAI SegResNet Engine</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-[#141414] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-4 text-xs text-neutral-400 font-sans">
          {/* Regulatory Restriction Alert */}
          <div className="p-3 rounded bg-[#160B0B] border border-red-900/40 text-red-200 space-y-1">
            <div className="flex items-center space-x-2 font-semibold uppercase tracking-wider text-[11px] text-red-400 font-mono">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Not a Medical Device or Clinical Tool</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              NeuroScope 3D is strictly an educational and algorithmic benchmarking prototype. It has not been clinically authorized for medical use.
              <strong className="text-white"> Never use predicted masks or estimated volumes for diagnosis, radiotherapy planning, or surgical decision-making.</strong>
            </p>
          </div>

          {/* MRI Modalities Guide */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-white uppercase tracking-wider flex items-center space-x-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Required MRI Sequences (BraTS Standard)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 rounded bg-[#000000] border border-[#222222] space-y-0.5">
                <span className="font-semibold text-white block">T1-Weighted (T1)</span>
                <span className="text-neutral-400 leading-normal">
                  Native T1 structural anatomical sequence supplied as input channel 0.
                </span>
              </div>
              <div className="p-2.5 rounded bg-[#000000] border border-[#222222] space-y-0.5">
                <span className="font-semibold text-white block">T1Gd (Contrast-Enhanced)</span>
                <span className="text-neutral-400 leading-normal">
                  Post-contrast T1 sequence capturing active angiogenesis supplied as channel 1.
                </span>
              </div>
              <div className="p-2.5 rounded bg-[#000000] border border-[#222222] space-y-0.5">
                <span className="font-semibold text-white block">T2-Weighted (T2)</span>
                <span className="text-neutral-400 leading-normal">
                  Spin-echo sequence capturing free water and tissue margins as channel 2.
                </span>
              </div>
              <div className="p-2.5 rounded bg-[#000000] border border-[#222222] space-y-0.5">
                <span className="font-semibold text-white block">FLAIR</span>
                <span className="text-neutral-400 leading-normal">
                  Inversion recovery sequence highlighting peritumoral edema as channel 3.
                </span>
              </div>
            </div>
          </div>

          {/* Sub-region Definitions */}
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-white uppercase tracking-wider flex items-center space-x-1.5 font-mono">
              <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
              <span>Tumour Sub-Region Hierarchy</span>
            </h3>
            <div className="p-3 rounded bg-[#000000] border border-[#222222] space-y-2 text-[11px]">
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#eab308] flex-shrink-0" />
                <div>
                  <strong className="text-white">Whole Tumour (WT):</strong> Labels 1 + 2 + 4. Comprehensive lesion mass including vasogenic edema.
                </div>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] flex-shrink-0" />
                <div>
                  <strong className="text-white">Tumour Core (TC):</strong> Labels 1 + 4. Pathological tumor core target: active enhancing tissue plus necrosis.
                </div>
              </div>
              <div className="flex items-center space-x-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4] flex-shrink-0" />
                <div>
                  <strong className="text-white">Enhancing Tumour (ET):</strong> Label 4 only. Viable vascularized tissue on post-gadolinium T1Gd.
                </div>
              </div>
            </div>
          </div>

          {/* Technical Limitations */}
          <div className="space-y-1.5">
            <h3 className="text-[11px] font-semibold text-white uppercase tracking-wider flex items-center space-x-1.5 font-mono">
              <AlertTriangle className="w-3.5 h-3.5 text-neutral-400" />
              <span>Technical Limitations & Assumptions</span>
            </h3>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-neutral-400">
              <li>Spatial coordinates follow input NIfTI voxel grid and affine matrix geometry.</li>
              <li>Volumes evaluate the analytical determinant: V = N_voxels × |det(affine)| ÷ 1000 mL.</li>
              <li>Cases expire and are cleaned automatically from the host system within 24 hours.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1C1C1C] bg-[#000000] flex items-center justify-between text-xs text-neutral-500 font-mono">
          <span>BraTS 2021 Standard</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
};

export default AboutModal;
