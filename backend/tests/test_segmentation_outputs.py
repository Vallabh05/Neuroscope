import hashlib
import json
from datetime import datetime, timezone
from unittest.mock import Mock

import nibabel as nib
import numpy as np
import pytest

from app.services.inference import InferenceResult, REQUIRED_MODALITIES
from app.services.integrity_report import (
    IntegrityReportError,
    build_integrity_report,
    generate_case_id,
    write_integrity_report,
)
from app.services.measurements import measure_segmentation
from app.services.nifti_export import (
    NiftiExportError,
    export_segmentation,
)
from app.services.segmentation_validation import (
    SegmentationValidationError,
    validate_segmentation,
)


@pytest.fixture
def reference_image():
    affine = np.diag([2.0, 3.0, 4.0, 1.0])
    affine[0, 3] = 12.5
    header = nib.Nifti1Header()
    header.set_data_shape((4, 3, 2))
    header.set_xyzt_units("mm")
    header.set_zooms((2.0, 3.0, 4.0))
    return nib.Nifti1Image(np.zeros((4, 3, 2), dtype=np.float32), affine, header)


@pytest.fixture
def valid_segmentation():
    labels = np.zeros((4, 3, 2), dtype=np.uint8)
    labels[0, 0, 0] = 1
    labels[0, 0, 1] = 2
    labels[0, 1, 0] = 4
    labels[0, 1, 1] = 4
    return labels


def validate(labels, reference_image):
    spacing = reference_image.header.get_zooms()[:3]
    return validate_segmentation(
        labels,
        reference_shape=reference_image.shape,
        reference_affine=reference_image.affine,
        output_affine=reference_image.affine,
        reference_spacing_mm=spacing,
        output_spacing_mm=spacing,
    )


def test_valid_output_has_label_counts_and_no_distribution_warning(
    valid_segmentation, reference_image
):
    result = validate(valid_segmentation, reference_image)

    assert result.segmentation.dtype == np.uint8
    assert result.label_counts == {0: 20, 1: 1, 2: 1, 4: 2}
    assert result.warnings == ()


def test_invalid_segmentation_dimensions_are_rejected(reference_image):
    with pytest.raises(SegmentationValidationError, match="three-dimensional"):
        validate_segmentation(
            np.zeros((2, 3), dtype=np.uint8),
            reference_shape=reference_image.shape,
            reference_affine=reference_image.affine,
            output_affine=reference_image.affine,
            reference_spacing_mm=reference_image.header.get_zooms()[:3],
        )


def test_segmentation_shape_must_match_reference(valid_segmentation, reference_image):
    with pytest.raises(SegmentationValidationError, match="does not match reference"):
        validate_segmentation(
            valid_segmentation[:, :, :1],
            reference_shape=reference_image.shape,
            reference_affine=reference_image.affine,
            output_affine=reference_image.affine,
            reference_spacing_mm=reference_image.header.get_zooms()[:3],
        )


@pytest.mark.parametrize(
    ("values", "message"),
    [
        ([0.0, np.nan], "NaN or infinite"),
        ([0.0, np.inf], "NaN or infinite"),
        ([0.0, 1.5], "fractional labels"),
        ([0.0, 3.0], "unsupported labels"),
    ],
)
def test_invalid_label_values_are_rejected(values, message, reference_image):
    labels = np.zeros(reference_image.shape, dtype=np.float32)
    labels.flat[:2] = values

    with pytest.raises(SegmentationValidationError, match=message):
        validate(labels, reference_image)


def test_empty_segmentation_is_returned_with_explicit_warning(reference_image):
    result = validate(np.zeros(reference_image.shape, dtype=np.uint8), reference_image)

    assert result.warnings == ("empty_segmentation",)
    assert result.label_counts[0] == np.prod(reference_image.shape)


def test_single_region_distribution_is_reported_as_warning(reference_image):
    labels = np.zeros(reference_image.shape, dtype=np.uint8)
    labels[0, 0, 0] = 4

    assert validate(labels, reference_image).warnings == (
        "single_tumor_label_present",
    )


def test_output_affine_mismatch_is_rejected(valid_segmentation, reference_image):
    shifted = reference_image.affine.copy()
    shifted[0, 3] += 1

    with pytest.raises(SegmentationValidationError, match="affine"):
        validate_segmentation(
            valid_segmentation,
            reference_shape=reference_image.shape,
            reference_affine=reference_image.affine,
            output_affine=shifted,
            reference_spacing_mm=reference_image.header.get_zooms()[:3],
        )


def test_output_spacing_mismatch_is_rejected(valid_segmentation, reference_image):
    with pytest.raises(SegmentationValidationError, match="spacing"):
        validate_segmentation(
            valid_segmentation,
            reference_shape=reference_image.shape,
            reference_affine=reference_image.affine,
            output_affine=reference_image.affine,
            reference_spacing_mm=reference_image.header.get_zooms()[:3],
            output_spacing_mm=(2.0, 3.1, 4.0),
        )


def test_region_volumes_reconstruct_nested_regions_from_stored_labels(
    valid_segmentation, reference_image
):
    result = measure_segmentation(
        valid_segmentation,
        reference_image.affine,
        spatial_units="mm",
    )

    assert result.voxel_volume_mm3 == pytest.approx(24)
    assert result.stored_label_counts == {0: 20, 1: 1, 2: 1, 4: 2}
    assert result.regions["tumor_core"].voxel_count == 3
    assert result.regions["tumor_core"].volume_mm3 == pytest.approx(72)
    assert result.regions["whole_tumor"].voxel_count == 4
    assert result.regions["whole_tumor"].volume_mm3 == pytest.approx(96)
    assert result.regions["enhancing_tumor"].volume_mm3 == pytest.approx(48)
    assert result.regions["enhancing_tumor"].volume_cm3 == pytest.approx(0.048)
    assert result.background_voxel_count == 20


def test_region_measurement_rejects_unknown_spatial_units(valid_segmentation, reference_image):
    with pytest.raises(SegmentationValidationError, match="Spatial units"):
        measure_segmentation(
            valid_segmentation,
            reference_image.affine,
            spatial_units="unknown",
        )


def test_nifti_export_round_trips_labels_and_reference_geometry(
    tmp_path, valid_segmentation, reference_image
):
    exported = export_segmentation(
        valid_segmentation,
        reference_image=reference_image,
        segmentation_affine=reference_image.affine,
        output_directory=tmp_path,
        case_id="case_123",
    )

    reopened = nib.load(str(exported.path))
    assert exported.filename == "case_123-seg.nii.gz"
    assert exported.shape == reference_image.shape
    assert exported.spacing_mm == (2.0, 3.0, 4.0)
    assert exported.verification == {
        "shape_matches": True,
        "affine_matches": True,
        "spacing_matches": True,
        "labels_match": True,
    }
    assert np.array_equal(np.asanyarray(reopened.dataobj), valid_segmentation)
    np.testing.assert_allclose(reopened.affine, reference_image.affine, atol=1e-4)
    assert reopened.header.get_xyzt_units()[0] == "mm"
    assert exported.sha256 == hashlib.sha256(exported.path.read_bytes()).hexdigest()


def test_export_rejects_traversal_and_existing_outputs(
    tmp_path, valid_segmentation, reference_image
):
    with pytest.raises(NiftiExportError, match="Case ID"):
        export_segmentation(
            valid_segmentation,
            reference_image=reference_image,
            segmentation_affine=reference_image.affine,
            output_directory=tmp_path,
            case_id="../escape",
        )

    export_segmentation(
        valid_segmentation,
        reference_image=reference_image,
        segmentation_affine=reference_image.affine,
        output_directory=tmp_path,
        case_id="existing",
    )
    with pytest.raises(NiftiExportError, match="already exists"):
        export_segmentation(
            valid_segmentation,
            reference_image=reference_image,
            segmentation_affine=reference_image.affine,
            output_directory=tmp_path,
            case_id="existing",
        )


def test_export_overwrite_requires_explicit_permission(
    tmp_path, valid_segmentation, reference_image
):
    initial = export_segmentation(
        valid_segmentation,
        reference_image=reference_image,
        segmentation_affine=reference_image.affine,
        output_directory=tmp_path,
        case_id="overwrite",
    )
    updated_segmentation = valid_segmentation.copy()
    updated_segmentation[0, 0, 0] = 4
    with pytest.raises(NiftiExportError, match="already exists"):
        export_segmentation(
            updated_segmentation,
            reference_image=reference_image,
            segmentation_affine=reference_image.affine,
            output_directory=tmp_path,
            case_id="overwrite",
        )

    updated = export_segmentation(
        updated_segmentation,
        reference_image=reference_image,
        segmentation_affine=reference_image.affine,
        output_directory=tmp_path,
        case_id="overwrite",
        allow_overwrite=True,
    )
    assert updated.sha256 != initial.sha256
    assert np.asanyarray(nib.load(str(updated.path)).dataobj)[0, 0, 0] == 4


def test_export_rejects_incompatible_geometry(
    tmp_path, valid_segmentation, reference_image
):
    shifted = reference_image.affine.copy()
    shifted[1, 3] += 2

    with pytest.raises(NiftiExportError, match="geometry"):
        export_segmentation(
            valid_segmentation,
            reference_image=reference_image,
            segmentation_affine=shifted,
            output_directory=tmp_path,
            case_id="shifted",
        )
    assert list(tmp_path.iterdir()) == []


def test_export_failure_cleans_temporary_and_reserved_files(
    tmp_path, valid_segmentation, reference_image, monkeypatch
):
    monkeypatch.setattr(
        "app.services.nifti_export.nib.save",
        Mock(side_effect=OSError("simulated write failure")),
    )
    with pytest.raises(NiftiExportError, match="Could not save"):
        export_segmentation(
            valid_segmentation,
            reference_image=reference_image,
            segmentation_affine=reference_image.affine,
            output_directory=tmp_path,
            case_id="failed",
        )
    assert list(tmp_path.iterdir()) == []


def _build_report_inputs(tmp_path, reference_image, valid_segmentation):
    input_paths = {}
    for modality in REQUIRED_MODALITIES:
        path = tmp_path / f"{modality}.nii"
        path.write_bytes(f"synthetic-{modality}".encode())
        input_paths[modality] = path

    validated = {
        "shape": reference_image.shape,
        "affine": reference_image.affine,
        "spacing_mm": np.asarray(reference_image.header.get_zooms()[:3]),
    }
    output_validation = validate(valid_segmentation, reference_image)
    measurements = measure_segmentation(
        valid_segmentation,
        reference_image.affine,
        spatial_units="mm",
    )
    inference = InferenceResult(
        segmentation=valid_segmentation,
        output_shape=valid_segmentation.shape,
        affine=reference_image.affine,
        spacing_mm=(2.0, 3.0, 4.0),
        device="cpu",
        model_identifier="test-model 1.0",
        inference_seconds=0.25,
        model_sha256="a" * 64,
        runtime_provenance={
            "python_version": "3.11.9",
            "numpy_version": "2.4.6",
            "torch_version": "2.11.0",
            "monai_version": "1.6.1",
            "cuda_runtime_version": None,
            "cudnn_version": None,
            "device_name": "CPU",
        },
        validation_warnings=(),
        inference_configuration={"threshold": 0.5},
    )
    export = export_segmentation(
        valid_segmentation,
        reference_image=reference_image,
        segmentation_affine=inference.affine,
        output_directory=tmp_path,
        case_id="case_report",
    )
    report = build_integrity_report(
        case_id="case_report",
        input_paths=input_paths,
        validated_modalities=validated,
        inference_result=inference,
        output_validation=output_validation,
        measurements=measurements,
        export_result=export,
        input_validation_warnings=("inputs_aligned",),
        generated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    return report, input_paths, export


def test_integrity_report_contains_hashes_schema_and_warnings(
    tmp_path, reference_image, valid_segmentation
):
    report, input_paths, export = _build_report_inputs(
        tmp_path, reference_image, valid_segmentation
    )

    assert report["schema_version"] == "1.3"
    assert report["generated_at"] == "2026-01-01T00:00:00+00:00"
    assert report["inputs"]["validation"] == {
        "status": "passed",
        "warnings": ["inputs_aligned"],
    }
    assert {item["modality"] for item in report["inputs"]["modalities"]} == set(
        REQUIRED_MODALITIES
    )
    for item in report["inputs"]["modalities"]:
        assert item["sha256"] == hashlib.sha256(
            input_paths[item["modality"]].read_bytes()
        ).hexdigest()
    assert report["segmentation"]["label_counts"] == {
        "0": 20,
        "1": 1,
        "2": 1,
        "4": 2,
    }
    assert (
        report["segmentation"]["region_volumes"]["tumor_core"]["volume_mm3"]
        == pytest.approx(72)
    )
    assert (
        report["segmentation"]["region_volumes"]["whole_tumor"]["volume_mm3"]
        == pytest.approx(96)
    )
    assert (
        report["segmentation"]["region_volumes"]["enhancing_tumor"]["volume_mm3"]
        == pytest.approx(48)
    )
    assert report["inference"]["model_sha256"] == "a" * 64
    assert report["inference"]["runtime_provenance"]["device_name"] == "CPU"
    assert report["export"]["sha256"] == export.sha256
    assert report["warnings"] == ["inputs_aligned"]
    assert report["errors"] == []
    assert all(str(path) not in json.dumps(report) for path in input_paths.values())


def test_case_ids_are_unique_and_path_safe():
    first = generate_case_id()
    second = generate_case_id()

    assert first != second
    assert len(first) == 32
    assert first.isalnum()


def test_integrity_report_is_written_atomically_without_overwrite(
    tmp_path, reference_image, valid_segmentation
):
    report, _, _ = _build_report_inputs(
        tmp_path, reference_image, valid_segmentation
    )
    path = write_integrity_report(
        report,
        output_directory=tmp_path,
        case_id="case_report",
    )

    assert json.loads(path.read_text(encoding="utf-8")) == report
    with pytest.raises(IntegrityReportError, match="already exists"):
        write_integrity_report(
            report,
            output_directory=tmp_path,
            case_id="case_report",
        )
