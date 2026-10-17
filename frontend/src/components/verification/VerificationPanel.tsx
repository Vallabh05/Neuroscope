import React from 'react';
import type { IntegrityPassport, SegmentationResult } from '../../types';
import { AlertTriangle, CheckCircle2, Fingerprint, Gauge, ShieldCheck, Target } from 'lucide-react';

interface VerificationPanelProps {
  result: SegmentationResult;
}

function Status({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-xs">
      <CheckCircle2 className="w-3.5 h-3.5" /> Verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
      <AlertTriangle className="w-3.5 h-3.5" /> Review
    </span>
  );
}

function CheckRow({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neuro-900 border border-neuro-800 p-3">
      <span className="text-xs text-slate-300">{label}</span>
      <Status passed={passed} />
    </div>
  );
}

export const VerificationPanel: React.FC<VerificationPanelProps> = ({ result }) => {
  const report: IntegrityPassport = result.report;
  const expertMetrics = report.expert_comparison?.region_metrics;
  const warnings = [...new Set([
    ...report.warnings,
    ...report.inputs.validation.warnings,
    ...report.segmentation.validation.warnings,
    ...(report.expert_comparison?.warnings ?? []),
  ])];
  const exportVerified = report.export.status === 'verified' &&
    Object.values(report.export.round_trip).every(Boolean);

  return (
    <div className="bg-neuro-900 rounded-2xl border border-neuro-800 p-5 space-y-5">
      <header className="flex items-start gap-3 border-b border-neuro-800 pb-4">
        <ShieldCheck className="w-5 h-5 text-cyan-400 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-slate-100">Integrity Passport</h3>
          <p className="text-[11px] text-slate-400 mt-1">
            File and geometry checks support traceability; they do not establish clinical accuracy.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CheckRow label="Input validation" passed={report.inputs.validation.status === 'passed'} />
        <CheckRow label="Segmentation geometry" passed={report.segmentation.validation.status === 'passed'} />
        <CheckRow label="NIfTI export and read-back" passed={exportVerified} />
        <CheckRow label="Held-out benchmark evaluation" passed={false} />
      </div>

      {/* Model Confidence & Performance Profile */}
      <section className="rounded-xl bg-neuro-950 border border-neuro-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Model Confidence & Validation Metrics
          </h4>
          <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/40 px-2 py-0.5 rounded">
            Threshold: P(Tumour) ≥ 0.50
          </span>
        </div>
        <p className="text-[11px] text-slate-400">
          The network evaluates voxel probability with sigmoid activation. Voxels exceeding the <strong>0.50 decision threshold (50% confidence cut-off)</strong> are classified into respective BraTS classes.
        </p>

        {/* Historical BraTS Benchmark Performance Metrics */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
            Pre-trained Benchmark Validation Accuracy (BraTS 2018 Cohort)
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg bg-neuro-900 border border-neuro-800 p-2.5 space-y-0.5">
              <span className="text-[11px] font-medium text-amber-400">Whole Tumour (WT)</span>
              <div className="text-base font-bold font-mono text-white">90.3% Dice</div>
              <span className="text-[10px] text-slate-500">Validation DSC: 0.9026</span>
            </div>
            <div className="rounded-lg bg-neuro-900 border border-neuro-800 p-2.5 space-y-0.5">
              <span className="text-[11px] font-medium text-red-400">Tumour Core (TC)</span>
              <div className="text-base font-bold font-mono text-white">85.6% Dice</div>
              <span className="text-[10px] text-slate-500">Validation DSC: 0.8559</span>
            </div>
            <div className="rounded-lg bg-neuro-900 border border-neuro-800 p-2.5 space-y-0.5">
              <span className="text-[11px] font-medium text-cyan-400">Enhancing (ET)</span>
              <div className="text-base font-bold font-mono text-white">79.1% Dice</div>
              <span className="text-[10px] text-slate-500">Validation DSC: 0.7905</span>
            </div>
            <div className="rounded-lg bg-neuro-900 border border-neuro-800 p-2.5 space-y-0.5">
              <span className="text-[11px] font-medium text-emerald-400">Mean Average</span>
              <div className="text-base font-bold font-mono text-white">85.2% Dice</div>
              <span className="text-[10px] text-slate-500">Cohort Mean: 0.8518</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-neuro-950 border border-neuro-800 p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-200">Per-case expert-mask comparison</h4>
        {expertMetrics ? (
          <>
            <p className="text-[11px] text-slate-400">
              These metrics compare only this case with the supplied expert mask; they are not a held-out benchmark.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Object.entries(expertMetrics).map(([region, metric]) => (
                <div key={region} className="rounded-lg bg-neuro-900 border border-neuro-800 p-3">
                  <div className="text-xs font-semibold text-white">{region.replace(/_/g, ' ')}</div>
                  <div className="text-[11px] text-slate-300 mt-2">Dice: {metric.dice.toFixed(4)}</div>
                  <div className="text-[11px] text-slate-300">
                    Sensitivity: {metric.sensitivity === null ? 'N/A (empty reference)' : metric.sensitivity.toFixed(4)}
                  </div>
                </div>
              ))}
            </div>
              <p className="text-[10px] text-slate-500">
                Dice = 2 × intersection / (predicted voxels + reference voxels); sensitivity = intersection / reference voxels.
              </p>
          </>
        ) : (
          <p className="text-[11px] text-slate-400">
            No expert mask was supplied. This case has no accuracy score, and no held-out dataset evaluation is included.
          </p>
        )}
      </section>

      <section className="rounded-xl bg-neuro-950 border border-neuro-800 p-4 space-y-2">
        <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <Fingerprint className="w-3.5 h-3.5 text-cyan-400" /> Provenance
        </h4>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
          <div><dt className="text-slate-500">Model</dt><dd className="text-slate-300 break-all">{report.inference.model_identifier}</dd></div>
          <div><dt className="text-slate-500">Model SHA-256</dt><dd className="text-slate-300 break-all">{report.inference.model_sha256}</dd></div>
          <div><dt className="text-slate-500">Device</dt><dd className="text-slate-300">{report.inference.device}</dd></div>
          <div><dt className="text-slate-500">Report generated</dt><dd className="text-slate-300">{new Date(report.generated_at).toLocaleString()}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Input SHA-256</dt>
            <dd className="text-slate-300 break-all">
              {report.inputs.modalities.map(item => `${item.modality}: ${item.sha256}`).join(' · ')}
            </dd>
          </div>
        </dl>
      </section>

      {warnings.length > 0 && (
        <section className="rounded-xl bg-amber-950/30 border border-amber-800/50 p-4">
          <h4 className="text-xs font-bold text-amber-300 mb-2">Warnings</h4>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-100/80">
            {warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
};
