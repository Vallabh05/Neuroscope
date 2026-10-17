import nibabel as nib
import numpy as np
import pytest

from app.services.expert_evaluation import (
    ExpertMaskValidationError,
    evaluate_regions,
    load_and_validate_expert_mask,
)


def save_mask(
    path,
    labels: np.ndarray,
    affine: np.ndarray | None = None,
    *,
    units: str = "mm",
):
    image = nib.Nifti1Image(
        labels,
        np.eye(4) if affine is None else affine,
    )
    image.header.set_xyzt_units(units)
    nib.save(image, str(path))


def test_expert_mask_requires_reference_geometry(tmp_path):
    path = tmp_path / "expert.nii"
    save_mask(path, np.zeros((4, 4, 4), dtype=np.uint8))

    with pytest.raises(ExpertMaskValidationError, match="dimensions"):
        load_and_validate_expert_mask(
            path,
            reference_shape=(4, 4, 3),
            reference_affine=np.eye(4),
            max_voxels=100,
        )

    shifted = np.eye(4)
    shifted[0, 3] = 1
    with pytest.raises(ExpertMaskValidationError, match="affine"):
        load_and_validate_expert_mask(
            path,
            reference_shape=(4, 4, 4),
            reference_affine=shifted,
            max_voxels=100,
        )


def test_expert_mask_rejects_fractional_and_unsupported_labels(tmp_path):
    path = tmp_path / "expert.nii"
    labels = np.zeros((4, 4, 4), dtype=np.float32)
    labels[0, 0, 0] = 1.5
    save_mask(path, labels)

    with pytest.raises(ExpertMaskValidationError, match="fractional"):
        load_and_validate_expert_mask(
            path,
            reference_shape=(4, 4, 4),
            reference_affine=np.eye(4),
            max_voxels=100,
        )

    labels[0, 0, 0] = 3
    save_mask(path, labels)
    with pytest.raises(ExpertMaskValidationError, match="BraTS codes"):
        load_and_validate_expert_mask(
            path,
            reference_shape=(4, 4, 4),
            reference_affine=np.eye(4),
            max_voxels=100,
        )


def test_expert_mask_measurements_and_empty_region_metrics(tmp_path):
    path = tmp_path / "expert.nii"
    affine = np.diag([1.0, 1.0, 2.0, 1.0])
    labels = np.zeros((4, 4, 4), dtype=np.uint8)
    labels[0, 0, 0] = 2
    save_mask(path, labels, affine)

    validated, measurements = load_and_validate_expert_mask(
        path,
        reference_shape=(4, 4, 4),
        reference_affine=affine,
        max_voxels=100,
    )
    np.testing.assert_array_equal(validated, labels)
    assert measurements.regions["whole_tumor"].voxel_count == 1
    assert measurements.regions["whole_tumor"].volume_mm3 == 2.0

    evaluation = evaluate_regions(
        np.zeros_like(labels),
        validated,
        affine=affine,
    )
    assert evaluation.regions["whole_tumor"].dice == 0.0
    assert evaluation.regions["whole_tumor"].sensitivity == 0.0
    assert evaluation.regions["tumor_core"].dice == 1.0
    assert evaluation.regions["tumor_core"].sensitivity is None
    assert "empty_reference_region:tumor_core" in evaluation.warnings
