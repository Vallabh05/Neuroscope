export type ModalityType = 't1' | 't1gd' | 't2' | 'flair' | 'reference_mask';

export interface ModalityFile {
  file: File | null;
  name: string;
  size: number;
  status: 'not_selected' | 'selected' | 'uploading' | 'validating' | 'valid' | 'invalid';
  errorMessage?: string;
}

export interface UploadSlotsState {
  t1: ModalityFile;
  t1gd: ModalityFile;
  t2: ModalityFile;
  flair: ModalityFile;
  reference_mask: ModalityFile;
}

export type JobStage =
  | 'idle'
  | 'receiving_files'
  | 'validating_geometry'
  | 'preprocessing_volumes'
  | 'running_inference'
  | 'restoring_coordinates'
  | 'verifying_segmentation'
  | 'preparing_outputs'
  | 'completed'
  | 'failed';

export interface RegionVolume {
  id: 'wt' | 'tc' | 'et';
  name: 'WT' | 'TC' | 'ET';
  fullName: string;
  volume_ml: number;
  volume_mm3: number;
  voxel_count: number;
  description: string;
  color: string;
  visible: boolean;
  opacity: number;
}

export interface NiftiVolume {
  dimensions: [number, number, number];
  spacing_mm: [number, number, number];
  affine: number[][];
  data: Float32Array | Uint8Array;
  display_range?: [number, number];
}

export type ModalityVolumes = Record<'t1' | 't1gd' | 't2' | 'flair', NiftiVolume>;

export interface ExpertRegionMetric {
  dice: number;
  sensitivity: number | null;
  predicted_voxel_count: number;
  reference_voxel_count: number;
  intersection_voxel_count: number;
}

export interface CaseResultResponse {
  case_id: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  modalities: string[];
  dimensions: [number, number, number] | null;
  spacing_mm: [number, number, number] | null;
  model_identifier: string | null;
  device: string | null;
  inference_seconds: number | null;
  label_counts: Record<string, number> | null;
  region_volumes: Record<string, {
    voxel_count: number;
    volume_mm3: number;
    volume_cm3: number;
  }> | null;
  expert_evaluation: {
    region_metrics: Record<string, ExpertRegionMetric>;
    warnings: string[];
  } | null;
  warnings: string[];
  error: string | null;
  mask_url: string | null;
  report_url: string | null;
}

export interface SegmentResponse {
  case_id: string;
  status: 'completed';
  model_identifier: string;
  device: string;
  inference_seconds: number;
  dimensions: [number, number, number];
  spacing_mm: [number, number, number];
  label_counts: Record<string, number>;
  region_volumes: Record<string, {
    voxel_count: number;
    volume_mm3: number;
    volume_cm3: number;
  }>;
  expert_evaluation: CaseResultResponse['expert_evaluation'];
  warnings: string[];
  mask_url: string;
  report_url: string;
}

export interface SegmentationResult {
  case_id: string;
  created_at: string;
  dimensions: [number, number, number];
  voxel_spacing_mm: [number, number, number];
  affine: number[][];
  volumes: Record<'wt' | 'tc' | 'et', RegionVolume>;
  modalities: ModalityVolumes;
  mask: NiftiVolume;
  model_identifier: string;
  model_device: string;
  inference_seconds: number;
  warnings: string[];
  expert_metrics: Record<string, ExpertRegionMetric> | null;
  report: IntegrityPassport;
}

export interface IntegrityPassport {
  schema_version: string;
  generated_at: string;
  inputs: {
    validation: { status: string; warnings: string[] };
    modalities: Array<{ modality: string; sha256: string }>;
    expert_mask: { sha256: string; validation: { status: string } } | null;
  };
  inference: {
    model_identifier: string;
    model_sha256: string;
    device: string;
    duration_seconds: number;
    configuration: Record<string, unknown>;
    runtime_provenance: Record<string, string | null>;
  };
  segmentation: {
    dimensions: number[];
    spacing_mm: number[];
    label_counts: Record<string, number>;
    region_volumes: Record<string, unknown>;
    validation: { status: string; warnings: string[] };
  };
  export: {
    status: string;
    filename: string;
    sha256: string;
    round_trip: Record<string, boolean>;
  };
  expert_comparison: {
    metric_definitions: Record<string, string>;
    region_metrics: Record<string, ExpertRegionMetric>;
    warnings: string[];
  } | null;
  warnings: string[];
  errors: string[];
}

export interface CoordinatesState {
  world: [number, number, number];
  voxel: [number, number, number];
}
