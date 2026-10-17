import React, { useRef } from 'react';
import { ModalityFile, ModalityType } from '../../types';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, RefreshCw, Info } from 'lucide-react';
import { formatFileSize } from '../../utils/coordinates';

interface ModalityCardProps {
  modality: ModalityType;
  title: string;
  badge: string;
  description: string;
  clinicalNote: string;
  modalityFile: ModalityFile;
  onFileSelect: (modality: ModalityType, file: File) => void;
  onFileRemove: (modality: ModalityType) => void;
  isOptional?: boolean;
}

export const ModalityCard: React.FC<ModalityCardProps> = ({
  modality,
  title,
  badge,
  description,
  clinicalNote,
  modalityFile,
  onFileSelect,
  onFileRemove,
  isOptional = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileValidationAndSelect(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleFileValidationAndSelect(file);
    }
  };

  const handleFileValidationAndSelect = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.nii') && !lowerName.endsWith('.nii.gz')) {
      alert(`Invalid format: "${file.name}" is not a recognized NIfTI file (.nii or .nii.gz).`);
      return;
    }
    onFileSelect(modality, file);
  };

  const hasFile = !!modalityFile.file;

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`group relative rounded-xl border transition-all duration-200 overflow-hidden ${
        hasFile
          ? modalityFile.status === 'invalid'
            ? 'border-red-500/60 bg-red-950/20 shadow-md shadow-red-950/30'
            : modalityFile.status === 'valid'
            ? 'border-emerald-500/60 bg-neuro-900 shadow-md shadow-emerald-950/20'
            : 'border-cyan-600/60 bg-neuro-900/90 shadow-md shadow-cyan-950/30'
          : 'border-neuro-800 bg-neuro-900/40 hover:border-neuro-700 hover:bg-neuro-900/70'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".nii,.nii.gz"
        className="hidden"
      />

      {/* Card Header */}
      <div className="p-4 border-b border-neuro-800/80 flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-100 text-sm tracking-tight">{title}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/50">
              {badge}
            </span>
            {isOptional && (
              <span className="text-[10px] uppercase font-semibold text-slate-400 bg-neuro-800 px-1.5 py-0.5 rounded">
                Optional
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 leading-snug">{description}</p>
        </div>

        {/* Status indicator icon */}
        <div>
          {hasFile ? (
            modalityFile.status === 'valid' ? (
              <span className="inline-flex items-center text-emerald-400 text-xs font-medium" title="File verified">
                <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-400" />
                Valid
              </span>
            ) : modalityFile.status === 'invalid' ? (
              <span className="inline-flex items-center text-red-400 text-xs font-medium" title={modalityFile.errorMessage}>
                <AlertCircle className="w-4 h-4 mr-1 text-red-400" />
                Invalid
              </span>
            ) : modalityFile.status === 'validating' ? (
              <span className="inline-flex items-center text-cyan-400 text-xs font-medium animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                Checking
              </span>
            ) : (
              <span className="inline-flex items-center text-cyan-300 text-xs font-mono">
                Selected
              </span>
            )
          ) : (
            <span className="text-[11px] font-mono text-slate-400 bg-neuro-850 px-2 py-0.5 rounded border border-neuro-800">
              Empty
            </span>
          )}
        </div>
      </div>

      {/* Card Body: Dropzone / Selected state */}
      <div className="p-4">
        {hasFile ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between p-3 rounded-lg bg-neuro-950/70 border border-neuro-800">
              <div className="flex items-start space-x-3 min-w-0 pr-2">
                <div className="p-2 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate font-mono" title={modalityFile.name}>
                    {modalityFile.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {formatFileSize(modalityFile.size)}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-neuro-800 transition-colors"
                  title="Replace file"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onFileRemove(modality)}
                  className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Error Message if invalid */}
            {modalityFile.errorMessage && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-[11px] text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{modalityFile.errorMessage}</span>
              </div>
            )}

          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border-2 border-dashed border-neuro-800 hover:border-cyan-500/50 rounded-xl p-5 text-center transition-all bg-neuro-950/30 hover:bg-cyan-950/10 flex flex-col items-center justify-center space-y-2 group/drop"
          >
            <div className="w-9 h-9 rounded-full bg-neuro-850 group-hover/drop:bg-cyan-500/20 text-slate-400 group-hover/drop:text-cyan-400 flex items-center justify-center transition-colors">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300 group-hover/drop:text-cyan-200">
                Click or drag & drop <span className="font-mono text-cyan-400">.nii / .nii.gz</span>
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Target: {title}
              </p>
            </div>
          </div>
        )}

        {/* Clinical Imaging Note */}
        <div className="mt-3 flex items-start space-x-1.5 text-[11px] text-slate-400 bg-neuro-950/40 p-2 rounded-lg border border-neuro-850">
          <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
          <span className="leading-tight">{clinicalNote}</span>
        </div>
      </div>
    </div>
  );
};
