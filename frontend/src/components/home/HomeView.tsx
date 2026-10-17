import React from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  Layers,
  Maximize2,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface HomeViewProps {
  onOpenWorkstation: () => void;
  onOpenCases: () => void;
  isBackendConnected: boolean;
  hasActiveCase: boolean;
  activeCaseId?: string | null;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onOpenWorkstation,
  onOpenCases,
  isBackendConnected,
  hasActiveCase,
  activeCaseId,
}) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:px-6 space-y-8 animate-fade-in">
      {/* Compact Engineering Hero */}
      <div className="border border-atern-border bg-atern-surface p-6 sm:p-8 rounded-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-atern-border">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center space-x-2.5">
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider bg-atern-bg border border-atern-border text-atern-muted">
                System v2.4.0
              </span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider bg-atern-blue/20 text-[#64B5F6] border border-atern-blue/40">
                MONAI SegResNet
              </span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wider bg-atern-bg border border-atern-border text-emerald-400">
                BraTS 2021
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-atern-text">
              NeuroScope 3D Workstation
            </h1>
            <p className="text-sm text-atern-muted leading-relaxed">
              Utilitarian volumetric MRI segmentation and anatomical verification environment.
              Engineered for local inference, multi-parametric orthogonal crosshair synchronization,
              and 3D lesion surface reconstruction.
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 min-w-[200px]">
            <button
              type="button"
              onClick={onOpenWorkstation}
              className="px-5 py-2.5 bg-atern-blue hover:bg-atern-blue-hover text-white text-xs font-semibold uppercase tracking-wider rounded-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <span>{hasActiveCase ? 'Open Active Workstation' : 'Open Workstation'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onOpenCases}
              className="px-5 py-2.5 bg-atern-bg hover:bg-atern-hover border border-atern-border text-atern-text text-xs font-semibold uppercase tracking-wider rounded-sm flex items-center justify-center space-x-2 transition-colors cursor-pointer"
            >
              <span>Upload MRI Sequences</span>
            </button>
          </div>
        </div>

        {/* System Status & Current Case Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-atern-muted block mb-1">
              Backend Execution State
            </span>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-none ${
                  isBackendConnected ? 'bg-emerald-400' : 'bg-red-500'
                }`}
              />
              <span className="text-xs font-mono font-semibold text-atern-text">
                {isBackendConnected ? 'FastAPI 127.0.0.1:8000 Online' : 'Backend Disconnected'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-atern-muted block mb-1">
              Active Loaded Case
            </span>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-none ${
                  hasActiveCase ? 'bg-atern-blue' : 'bg-atern-border'
                }`}
              />
              <span className="text-xs font-mono font-semibold text-atern-text truncate">
                {hasActiveCase && activeCaseId ? activeCaseId : 'No study currently loaded'}
              </span>
            </div>
          </div>

          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm">
            <span className="text-[10px] font-mono uppercase tracking-wider text-atern-muted block mb-1">
              Inference Target Specs
            </span>
            <div className="flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5 text-atern-blue flex-shrink-0" />
              <span className="text-xs font-mono font-semibold text-atern-text">
                4-Modality Co-Registration (T1, T1ce, T2, FLAIR)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Architecture & Pipeline Sections */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-atern-muted font-bold">
          System Architecture & Pipeline Execution
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Step 1: Input Validation */}
          <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-atern-muted uppercase">Stage 01</span>
              <Database className="w-4 h-4 text-atern-blue" />
            </div>
            <h3 className="text-xs font-bold text-atern-text uppercase">Spatial Ingestion</h3>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Validates header geometry, 3D affine orientation, dimensions, and finite intensity bounds across all four NIfTI volumes.
            </p>
          </div>

          {/* Step 2: SegResNet Inference */}
          <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-atern-muted uppercase">Stage 02</span>
              <Cpu className="w-4 h-4 text-atern-blue" />
            </div>
            <h3 className="text-xs font-bold text-atern-text uppercase">MONAI SegResNet</h3>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Runs deep neural network inference on CPU or GPU with sigmoid thresholding to segment BraTS labels: NCR, ED, and ET.
            </p>
          </div>

          {/* Step 3: Volumetric Calculus */}
          <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-atern-muted uppercase">Stage 03</span>
              <Activity className="w-4 h-4 text-atern-blue" />
            </div>
            <h3 className="text-xs font-bold text-atern-text uppercase">Metric Integration</h3>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Computes analytical voxel integrals via |det(affine)| in mL and mm³, 3D centroids, bounding boxes, and slice burden profiles.
            </p>
          </div>

          {/* Step 4: Verification & Export */}
          <div className="border border-atern-border bg-atern-surface p-4 rounded-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-atern-muted uppercase">Stage 04</span>
              <FileText className="w-4 h-4 text-atern-blue" />
            </div>
            <h3 className="text-xs font-bold text-atern-text uppercase">Passport & Exports</h3>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Generates cryptographic SHA-256 passports, verified NIfTI label masks, RFC 4180 CSV tables, and structured clinical PDF reports.
            </p>
          </div>
        </div>
      </div>

      {/* Tumour Regions Definition Matrix */}
      <div className="border border-atern-border bg-atern-surface p-5 rounded-sm space-y-4">
        <div className="flex items-center justify-between border-b border-atern-border pb-3">
          <h2 className="text-xs font-mono uppercase tracking-wider text-atern-muted font-bold">
            BraTS 2021 Label Specifications & Anatomical Regions
          </h2>
          <span className="text-[10px] font-mono text-atern-muted">ISO 13485 / Research Standard</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#D97706] font-mono">Whole Tumour (WT)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-atern-surface text-atern-muted border border-atern-border">
                Labels 1 + 2 + 4
              </span>
            </div>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Composite lesion mass encompassing vasogenic peritumoral edema, necrotic core, and active enhancing tissue.
            </p>
          </div>

          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#DC2626] font-mono">Tumour Core (TC)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-atern-surface text-atern-muted border border-atern-border">
                Labels 1 + 4
              </span>
            </div>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Pathological tumor core target: necrotic/non-enhancing components plus viable angiogenic enhancing tissue.
            </p>
          </div>

          <div className="p-3 bg-atern-bg border border-atern-border rounded-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#0284C7] font-mono">Enhancing Tumour (ET)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-atern-surface text-atern-muted border border-atern-border">
                Label 4 only
              </span>
            </div>
            <p className="text-[11px] text-atern-muted leading-relaxed">
              Hyperintense vascularized tissue on contrast-enhanced T1Gd reflecting disrupted blood-brain barrier permeability.
            </p>
          </div>
        </div>
      </div>

      {/* Engineering Design & Privacy Disclosures */}
      <div className="border border-atern-border bg-atern-bg p-4 rounded-sm flex items-start space-x-3 text-[11px] text-atern-muted">
        <ShieldCheck className="w-4 h-4 text-atern-blue flex-shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-atern-text">Local Storage & Ephemeral Lifecycle:</strong> MRI series uploaded into this instance are processed locally by the FastAPI daemon on your machine. Cases expire and are cleaned automatically within 24 hours.
          </p>
          <p>
            <strong className="text-atern-text">Research Prototype Disclaimer:</strong> NeuroScope 3D is developed strictly for research, engineering verification, and algorithmic benchmarking. It is not an FDA/CE cleared medical device and must not be used for diagnosis or patient treatment.
          </p>
        </div>
      </div>
    </div>
  );
};
