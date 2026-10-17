from __future__ import annotations

import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping, Sequence
from uuid import uuid4

import numpy as np

from app.services.expert_evaluation import ExpertEvaluation, REGION_LABELS
from app.services.inference import (
    REQUIRED_MODALITIES,
    InferenceResult,
    ValidatedModalities,
)
from app.services.measurements import SegmentationMeasurements
from app.services.nifti_export import (
    NiftiExportError,
    NiftiExportResult,
    sha256_file,
)
from app.services.segmentation_validation import (
    GEOMETRY_ATOL,
    SegmentationValidationResult,
)


REPORT_SCHEMA_VERSION = "1.3"
_SAFE_CASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


class IntegrityReportError(RuntimeError):
    """Raised when an integrity report cannot be safely created or written."""


def generate_case_id() -> str:
    """Create a path-safe, non-identifying identifier for a processing case."""
    return uuid4().hex


def build_integrity_report(
    *,
    case_id: str,
    input_paths: Mapping[str, str | Path],
    validated_modalities: ValidatedModalities,
    inference_result: InferenceResult,
    output_validation: SegmentationValidationResult,
    measurements: SegmentationMeasurements,
    export_result: NiftiExportResult,
    expert_mask_path: str | Path | None = None,
    expert_evaluation: ExpertEvaluation | None = None,
    input_validation_warnings: Sequence[str] = (),
    errors: Sequence[str] = (),
    generated_at: datetime | None = None,
) -> dict[str, object]:
    """Build a JSON-safe passport using observed inputs and verified outputs."""
    if not isinstance(case_id, str) or not _SAFE_CASE_ID.fullmatch(case_id):
        raise IntegrityReportError("Case ID is invalid for a report.")
    missing = [name for name in REQUIRED_MODALITIES if name not in input_paths]
    if missing:
        raise IntegrityReportError(
            "Input file paths are missing modalities: " + ", ".join(missing)
        )
    if generated_at is None:
        generated_at = datetime.now(timezone.utc)
    if generated_at.tzinfo is None or generated_at.utcoffset() is None:
        raise IntegrityReportError(
            "Report generation timestamp must include a timezone."
        )

    try:
        input_files = [
            {
                "modality": modality,
                "sha256": sha256_file(input_paths[modality]),
            }
            for modality in REQUIRED_MODALITIES
        ]
    except NiftiExportError as exc:
        raise IntegrityReportError(
            "Could not hash one or more MRI input files."
        ) from exc

    shape = tuple(int(value) for value in validated_modalities["shape"])
    affine = np.asarray(validated_modalities["affine"], dtype=np.float64)
    spacing_mm = tuple(
        float(value) for value in validated_modalities["spacing_mm"]
    )
    if affine.shape != (4, 4) or not np.isfinite(affine).all():
        raise IntegrityReportError(
            "Validated MRI geometry is not suitable for an integrity report."
        )
    if (
        tuple(inference_result.output_shape) != shape
        or tuple(output_validation.segmentation.shape) != shape
        or inference_result.segmentation.shape != shape
        or not np.array_equal(
            inference_result.segmentation, output_validation.segmentation
        )
        or not np.allclose(
            inference_result.affine,
            affine,
            atol=GEOMETRY_ATOL,
            rtol=0,
        )
        or not np.allclose(
            inference_result.spacing_mm,
            spacing_mm,
            atol=GEOMETRY_ATOL,
            rtol=0,
        )
    ):
        raise IntegrityReportError(
            "Inference, validation, and reference MRI results do not describe "
            "the same segmentation grid."
        )
    if not re.fullmatch(r"[0-9a-f]{64}", inference_result.model_sha256):
        raise IntegrityReportError(
            "Inference model integrity hash is missing or malformed."
        )
    required_export_checks = {
        "shape_matches",
        "affine_matches",
        "spacing_matches",
        "labels_match",
    }
    if (
        export_result.shape != shape
        or set(export_result.verification) != required_export_checks
        or not all(export_result.verification.values())
        or not np.allclose(
            export_result.affine,
            inference_result.affine,
            atol=GEOMETRY_ATOL,
            rtol=0,
        )
        or not np.allclose(
            export_result.spacing_mm,
            inference_result.spacing_mm,
            atol=GEOMETRY_ATOL,
            rtol=0,
        )
        or export_result.filename != f"{case_id}-seg.nii.gz"
        or not re.fullmatch(r"[0-9a-f]{64}", export_result.sha256)
    ):
        raise IntegrityReportError(
            "NIfTI export metadata is incomplete or failed verification."
        )
    try:
        current_export_hash = sha256_file(export_result.path)
    except NiftiExportError as exc:
        raise IntegrityReportError(
            "Could not verify the exported mask hash for the report."
        ) from exc
    if current_export_hash != export_result.sha256:
        raise IntegrityReportError(
            "Exported mask changed after its NIfTI verification."
        )

    if measurements.stored_label_counts != output_validation.label_counts:
        raise IntegrityReportError(
            "Stored label counts do not match the validated segmentation."
        )

    region_labels = {
        "tumor_core": (1, 4),
        "whole_tumor": (1, 2, 4),
        "enhancing_tumor": (4,),
    }
    for name, labels in region_labels.items():
        expected_count = sum(output_validation.label_counts[label] for label in labels)
        if measurements.regions[name].voxel_count != expected_count:
            raise IntegrityReportError(
                "Nested region volumes do not match the precedence-coded labels."
            )

    region_volumes = {
        name: {
            "labels_included": list(region_labels[name]),
            "voxel_count": metrics.voxel_count,
            "volume_mm3": metrics.volume_mm3,
            "volume_cm3": metrics.volume_cm3,
        }
        for name, metrics in measurements.regions.items()
    }
    if (expert_mask_path is None) != (expert_evaluation is None):
        raise IntegrityReportError(
            "Expert mask path and validated comparison must be provided together."
        )

    expert_mask_report = None
    comparison_report = None
    if expert_mask_path is not None:
        if expert_evaluation is None:
            raise IntegrityReportError(
                "An expert mask path requires a validated comparison result."
            )
        try:
            expert_mask_hash = sha256_file(expert_mask_path)
        except NiftiExportError as exc:
            raise IntegrityReportError(
                "Could not hash the expert mask input."
            ) from exc
        expert_mask_report = {
            "sha256": expert_mask_hash,
            "validation": {"status": "passed"},
            "label_counts": {
                str(label): count
                for label, count in expert_evaluation.measurements.stored_label_counts.items()
            },
            "region_volumes": {
                name: {
                    "labels_included": list(REGION_LABELS[name]),
                    "voxel_count": metrics.voxel_count,
                    "volume_mm3": metrics.volume_mm3,
                    "volume_cm3": metrics.volume_cm3,
                }
                for name, metrics in expert_evaluation.measurements.regions.items()
            },
        }
        comparison_report = {
            "metric_definitions": {
                "dice": "2 * intersection / (predicted voxels + reference voxels); 1 when both regions are empty",
                "sensitivity": "intersection / reference voxels; null when the reference region is empty",
            },
            "region_metrics": {
                name: {
                    "dice": metric.dice,
                    "sensitivity": metric.sensitivity,
                    "predicted_voxel_count": metric.predicted_voxel_count,
                    "reference_voxel_count": metric.reference_voxel_count,
                    "intersection_voxel_count": metric.intersection_voxel_count,
                }
                for name, metric in expert_evaluation.regions.items()
            },
            "warnings": list(expert_evaluation.warnings),
        }
    warnings = list(
        dict.fromkeys(
            [
                *input_validation_warnings,
                *inference_result.validation_warnings,
                *output_validation.warnings,
                *export_result.warnings,
                *(
                    expert_evaluation.warnings
                    if expert_evaluation is not None
                    else ()
                ),
            ]
        )
    )

    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "generated_at": generated_at.astimezone(timezone.utc).isoformat(),
        "case_id": case_id,
        "inputs": {
            "modalities": input_files,
            "expert_mask": expert_mask_report,
            "validation": {"status": "passed", "warnings": list(input_validation_warnings)},
            "dimensions": list(shape),
            "spacing_mm": list(spacing_mm),
            "affine": affine.tolist(),
        },
        "inference": {
            "model_identifier": inference_result.model_identifier,
            "model_sha256": inference_result.model_sha256,
            "device": inference_result.device,
            "duration_seconds": inference_result.inference_seconds,
            "configuration": inference_result.inference_configuration,
            "runtime_provenance": inference_result.runtime_provenance,
        },
        "segmentation": {
            "dimensions": list(output_validation.segmentation.shape),
            "spacing_mm": list(inference_result.spacing_mm),
            "affine": inference_result.affine.tolist(),
            "label_counts": {
                str(label): count
                for label, count in output_validation.label_counts.items()
            },
            "region_volumes": region_volumes,
            "voxel_volume_mm3": measurements.voxel_volume_mm3,
            "measurement_basis": (
                "The NIfTI mask stores exclusive classes using ET > TC > WT "
                "precedence. Stored label_counts describe those exact classes. "
                "Nested regions are reconstructed as TC = labels 1 or 4, "
                "WT = labels 1, 2, or 4, and ET = label 4. These region "
                "volumes overlap and must not be added together."
            ),
            "validation": {
                "status": "passed",
                "warnings": list(output_validation.warnings),
            },
        },
        "export": {
            "status": "verified",
            "filename": export_result.filename,
            "sha256": export_result.sha256,
            "round_trip": export_result.verification,
        },
        "expert_comparison": comparison_report,
        "warnings": warnings,
        "errors": list(errors),
    }
    try:
        json.dumps(report, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise IntegrityReportError(
            "Integrity report contains values that cannot be represented in JSON."
        ) from exc
    return report


def _reserve_target(target: Path) -> bool:
    try:
        descriptor = os.open(
            target,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
    except FileExistsError:
        return False
    os.close(descriptor)
    return True


def write_integrity_report(
    report: Mapping[str, object],
    *,
    output_directory: str | Path,
    case_id: str,
    allow_overwrite: bool = False,
) -> Path:
    """Write an integrity passport atomically under an explicitly supplied directory."""
    if not isinstance(case_id, str) or not _SAFE_CASE_ID.fullmatch(case_id):
        raise IntegrityReportError("Case ID is invalid for a report filename.")
    if report.get("case_id") != case_id:
        raise IntegrityReportError(
            "Report case ID does not match the requested output filename."
        )
    try:
        content = json.dumps(
            report,
            ensure_ascii=True,
            allow_nan=False,
            indent=2,
            sort_keys=True,
        )
    except (TypeError, ValueError) as exc:
        raise IntegrityReportError(
            "Integrity report contains values that cannot be serialized as JSON."
        ) from exc

    output_dir = Path(output_directory)
    filename = f"{case_id}-integrity.json"
    target = output_dir / filename
    reserved_target = False
    temporary_path: Path | None = None
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        if not allow_overwrite:
            reserved_target = _reserve_target(target)
            if not reserved_target:
                raise IntegrityReportError(
                    f"Report already exists: {filename}. Use a new case ID or "
                    "explicitly allow overwrite."
                )
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{case_id}-",
            suffix=".json",
            dir=output_dir,
        )
        temporary_path = Path(temporary_name)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(content)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_path, target)
        temporary_path = None
        reserved_target = False
        return target
    except IntegrityReportError:
        raise
    except OSError as exc:
        raise IntegrityReportError(
            "Could not atomically write the integrity report."
        ) from exc
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
        if reserved_target:
            target.unlink(missing_ok=True)
