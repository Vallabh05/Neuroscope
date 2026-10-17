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
      className={`relative rounded-sm border transition-colors ${
        hasFile
          ? modalityFile.status === 'invalid'
            ? 'border-red-600 bg-atern-surface'
            : 'border-atern-blue bg-atern-surface'
          : 'border-atern-border bg-atern-surface hover:border-atern-muted'
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
      <div className="p-3.5 border-b border-atern-border flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-atern-text text-xs uppercase tracking-wider font-mono">
              {title}
            </span>
            <span className="px-1.5 py-0.2 rounded-none text-[10px] font-mono font-bold bg-atern-bg text-atern-blue border border-atern-border">
              {badge}
            </span>
            {isOptional && (
              <span className="text-[10px] font-mono uppercase text-atern-muted bg-atern-bg px-1.5 py-0.2 border border-atern-border">
                Optional
              </span>
            )}
          </div>
          <p className="text-[11px] text-atern-muted leading-snug">{description}</p>
        </div>

        {/* Status indicator badge */}
        <div>
          {hasFile ? (
            modalityFile.status === 'valid' ? (
              <span className="inline-flex items-center text-emerald-400 text-xs font-mono font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                LOADED
              </span>
            ) : modalityFile.status === 'invalid' ? (
              <span className="inline-flex items-center text-red-400 text-xs font-mono font-medium">
                <AlertCircle className="w-3.5 h-3.5 mr-1 text-red-400" />
                INVALID
              </span>
            ) : (
              <span className="inline-flex items-center text-atern-blue text-xs font-mono font-medium">
                READY
              </span>
            )
          ) : (
            <span className="text-[10px] font-mono text-atern-muted bg-atern-bg px-2 py-0.5 rounded-none border border-atern-border">
              EMPTY
            </span>
          )}
        </div>
      </div>

      {/* Card Body: Dropzone / Selected file presentation */}
      <div className="p-3.5 space-y-3">
        {hasFile ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-sm bg-atern-bg border border-atern-border">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <div className="p-1.5 rounded-none bg-atern-surface text-atern-blue border border-atern-border flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div
                    className="text-xs font-mono font-medium text-atern-text truncate"
                    title={modalityFile.name}
                  >
                    {modalityFile.name}
                  </div>
                  <div className="text-[10px] font-mono text-atern-muted mt-0.5">
                    {formatFileSize(modalityFile.size)}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-none text-atern-muted hover:text-atern-text hover:bg-atern-surface border border-transparent hover:border-atern-border transition-colors cursor-pointer"
                  title="Replace file"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onFileRemove(modality)}
                  className="p-1.5 rounded-none text-atern-muted hover:text-red-400 hover:bg-atern-surface border border-transparent hover:border-atern-border transition-colors cursor-pointer"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Error or validation warning message */}
            {modalityFile.errorMessage && (
              <div className="p-2.5 rounded-sm bg-amber-950/20 border border-amber-800/40 text-[11px] font-mono text-amber-300 flex items-start space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>{modalityFile.errorMessage}</span>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer border border-dashed border-atern-border hover:border-atern-blue rounded-sm p-5 text-center transition-colors bg-atern-bg hover:bg-atern-hover flex flex-col items-center justify-center space-y-2 group"
          >
            <div className="w-8 h-8 rounded-none bg-atern-surface text-atern-muted group-hover:text-atern-blue flex items-center justify-center border border-atern-border transition-colors">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-mono text-atern-text group-hover:text-atern-blue">
                Select or drop <span className="text-atern-blue">.nii / .nii.gz</span>
              </p>
              <p className="text-[10px] font-mono text-atern-muted mt-0.5">
                Channel: {badge}
              </p>
            </div>
          </div>
        )}

        {/* Clinical Note */}
        <div className="flex items-start space-x-1.5 text-[11px] text-atern-muted bg-atern-bg p-2 rounded-sm border border-atern-border">
          <Info className="w-3 h-3 text-atern-blue flex-shrink-0 mt-0.5" />
          <span className="leading-tight">{clinicalNote}</span>
        </div>
      </div>
    </div>
  );
};
