import React, { useRef } from 'react';
import { ModalityFile, ModalityType } from '../../types';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Info,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
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
      className={`rounded border transition-colors ${
        hasFile
          ? modalityFile.status === 'invalid'
            ? 'border-red-900/60 bg-[#0F0808]'
            : 'border-[#333333] bg-[#0E0E0E]'
          : 'border-[#222222] bg-[#0A0A0A] hover:border-[#333333] hover:bg-[#0E0E0E]'
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
      <div className="p-3.5 border-b border-[#1C1C1C] flex items-start justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-white text-xs font-sans tracking-tight">
              {title}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#141414] text-neutral-300 border border-[#262626]">
              {badge}
            </span>
            {isOptional && (
              <span className="text-[10px] font-mono uppercase text-neutral-500 bg-[#111111] px-1.5 py-0.5 rounded border border-[#222222]">
                Optional
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-400 leading-snug font-sans">{description}</p>
        </div>

        {/* Status indicator */}
        <div>
          {hasFile ? (
            modalityFile.status === 'valid' ? (
              <span className="inline-flex items-center text-emerald-400 text-xs font-mono">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Loaded
              </span>
            ) : modalityFile.status === 'invalid' ? (
              <span className="inline-flex items-center text-red-400 text-xs font-mono">
                <AlertCircle className="w-3.5 h-3.5 mr-1" />
                Invalid
              </span>
            ) : (
              <span className="inline-flex items-center text-neutral-300 text-xs font-mono">
                Selected
              </span>
            )
          ) : (
            <span className="text-[10px] font-mono text-neutral-500 bg-[#111111] px-2 py-0.5 rounded border border-[#222222]">
              Empty
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3.5 space-y-2.5">
        {hasFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded bg-[#000000] border border-[#222222]">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <div className="p-1.5 rounded bg-[#111111] text-neutral-300 border border-[#222222] flex-shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-mono text-white truncate" title={modalityFile.name}>
                    {modalityFile.name}
                  </div>
                  <div className="text-[10px] font-mono text-neutral-500 mt-0.5">
                    {formatFileSize(modalityFile.size)}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-[#1C1C1C] transition-colors cursor-pointer"
                  title="Replace file"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onFileRemove(modality)}
                  className="p-1 rounded text-neutral-400 hover:text-red-400 hover:bg-[#1C1C1C] transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Error or validation warning */}
            {modalityFile.errorMessage && (
              <div className="p-2 rounded bg-[#160B0B] border border-red-900/50 text-[11px] font-mono text-red-300 flex items-start space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <span>{modalityFile.errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border border-dashed border-[#262626] hover:border-[#444444] rounded p-4 text-center transition-colors bg-[#000000] hover:bg-[#070707] flex flex-col items-center justify-center space-y-1.5 group"
          >
            <div className="w-7 h-7 rounded bg-[#111111] text-neutral-400 group-hover:text-white flex items-center justify-center border border-[#222222] transition-colors">
              <Upload className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="text-xs font-mono text-neutral-300 group-hover:text-white">
                Drop <span className="text-white">.nii / .nii.gz</span> file or click
              </p>
              <p className="text-[10px] font-mono text-neutral-500 mt-0.5">
                Channel: {badge}
              </p>
            </div>
          </div>
        )}

        {/* Clinical Note */}
        <div className="flex items-start space-x-1.5 text-[11px] text-neutral-400 bg-[#000000] p-2 rounded border border-[#1C1C1C]">
          <Info className="w-3 h-3 text-neutral-500 flex-shrink-0 mt-0.5" />
          <span className="leading-tight font-sans">{clinicalNote}</span>
        </div>
      </div>
    </div>
  );
};

export default ModalityCard;
