from __future__ import annotations

import json
import hashlib
import platform
import time
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

import monai
import nibabel as nib
import numpy as np
import torch
from monai.inferers import SlidingWindowInferer
from monai.transforms import NormalizeIntensity
from nibabel.processing import resample_from_to, resample_to_output

from app.services.validation import MODEL_SPACING_MM


REQUIRED_MODALITIES = ("T1ce", "T1", "T2", "FLAIR")
EXPECTED_BUNDLE_CHANNELS = ("T1c", "T1", "T2", "FLAIR")
EXPECTED_OUTPUT_LABELS = ("Tumor core", "Whole tumor", "Enhancing tumor")
EXPECTED_LABEL_RULE = (
    "$lambdax:torch.where(x[[2]]>0,4,"
    "torch.where(x[[0]]>0,1,torch.where(x[[1]]>0,2,0)))"
)
MODEL_FILENAME = "model.ts"


class ValidatedModalities(TypedDict):
    arrays: Mapping[str, np.ndarray]
    images: Mapping[str, nib.spatialimages.SpatialImage]
    shape: tuple[int, int, int]
    affine: np.ndarray
    spacing_mm: np.ndarray
    channel_order: tuple[str, ...]
    warnings: tuple[str, ...]


@dataclass(frozen=True)
class InferenceResult:
    segmentation: np.ndarray
    output_shape: tuple[int, int, int]
    affine: np.ndarray
    spacing_mm: tuple[float, float, float]
    device: str
    model_identifier: str
    inference_seconds: float
    model_sha256: str
    runtime_provenance: dict[str, str | None]
    validation_warnings: tuple[str, ...]
    inference_configuration: dict[str, object]


@dataclass(frozen=True)
class _InferenceSettings:
    roi_size: tuple[int, int, int]
    sw_batch_size: int
    overlap: float
    normalize_nonzero: bool
    normalize_channel_wise: bool
    threshold: float
    model_identifier: str


class InferenceError(RuntimeError):
    """Raised when model loading or MRI inference cannot complete safely."""


def _mapping(value: object, name: str) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise InferenceError(f"Model bundle configuration is missing {name}.")
    return value


def _read_json(path: Path, name: str) -> Mapping[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise InferenceError(
            f"Could not read the model bundle {name} at {path}."
        ) from exc
    return _mapping(value, name)


def _find_transform(
    config: Mapping[str, object],
    section: str,
    target: str,
) -> Mapping[str, object]:
    section_config = _mapping(config.get(section), section)
    transforms = section_config.get("transforms")
    if not isinstance(transforms, list):
        raise InferenceError(
            f"Model bundle configuration has no {section} transform list."
        )

    for transform in transforms:
        transform_config = _mapping(transform, f"{section} transform")
        if transform_config.get("_target_") == target:
            return transform_config

    raise InferenceError(
        f"Model bundle configuration is missing the {target} transform."
    )


def _load_settings(bundle_root: Path) -> _InferenceSettings:
    config = _read_json(
        bundle_root / "configs" / "inference.json",
        "inference configuration",
    )
    metadata = _read_json(
        bundle_root / "configs" / "metadata.json",
        "model metadata",
    )

    network_format = _mapping(
        metadata.get("network_data_format"),
        "network_data_format",
    )
    input_specs = _mapping(network_format.get("inputs"), "input metadata")
    image_spec = _mapping(input_specs.get("image"), "image input metadata")
    input_channels = image_spec.get("channel_def")
    if not isinstance(input_channels, Mapping):
        raise InferenceError("Model metadata has no input channel definitions.")
    channel_order = tuple(
        input_channels.get(str(index)) for index in range(4)
    )
    if (
        image_spec.get("num_channels") != 4
        or channel_order != EXPECTED_BUNDLE_CHANNELS
    ):
        raise InferenceError(
            "The model input channel definitions do not match the "
            "validated T1ce, T1, T2, FLAIR order."
        )

    output_specs = _mapping(network_format.get("outputs"), "output metadata")
    prediction_spec = _mapping(output_specs.get("pred"), "prediction metadata")
    output_channels = prediction_spec.get("channel_def")
    if not isinstance(output_channels, Mapping):
        raise InferenceError("Model metadata has no output channel definitions.")
    output_labels = tuple(
        output_channels.get(str(index)) for index in range(3)
    )
    if (
        prediction_spec.get("num_channels") != 3
        or output_labels != EXPECTED_OUTPUT_LABELS
    ):
        raise InferenceError(
            "The model output channel definitions do not match the "
            "documented TC, WT, ET order."
        )

    normalization = _find_transform(
        config,
        "preprocessing",
        "NormalizeIntensityd",
    )
    if (
        normalization.get("nonzero") is not True
        or normalization.get("channel_wise") is not True
    ):
        raise InferenceError(
            "The configured preprocessing is not the supported "
            "channel-wise nonzero intensity normalization."
        )

    inferer = _mapping(config.get("inferer"), "inferer")
    roi_size = inferer.get("roi_size")
    if (
        not isinstance(roi_size, list)
        or len(roi_size) != 3
        or any(type(size) is not int or size <= 0 for size in roi_size)
    ):
        raise InferenceError("The configured 3D sliding-window ROI is invalid.")

    sw_batch_size = inferer.get("sw_batch_size")
    overlap = inferer.get("overlap")
    if type(sw_batch_size) is not int or sw_batch_size <= 0:
        raise InferenceError("The configured sliding-window batch size is invalid.")
    if (
        not isinstance(overlap, (int, float))
        or isinstance(overlap, bool)
        or not 0 <= overlap < 1
    ):
        raise InferenceError("The configured sliding-window overlap is invalid.")

    activation = _find_transform(config, "postprocessing", "Activationsd")
    discretization = _find_transform(config, "postprocessing", "AsDiscreted")
    label_transform = _find_transform(config, "postprocessing", "Lambdad")
    label_rule = "".join(str(label_transform.get("func", "")).split())
    if activation.get("sigmoid") is not True:
        raise InferenceError(
            "The configured output activation is not the supported sigmoid."
        )
    if (
        not isinstance(discretization.get("threshold"), (int, float))
        or isinstance(discretization.get("threshold"), bool)
        or discretization.get("threshold") != 0.5
    ):
        raise InferenceError(
            "The configured segmentation threshold is not the supported 0.5."
        )
    if label_rule != EXPECTED_LABEL_RULE:
        raise InferenceError(
            "The configured tumour-label mapping is not the supported "
            "ET-over-TC-over-WT precedence."
        )

    model_name = metadata.get("name")
    version = metadata.get("version")
    if not isinstance(model_name, str) or not isinstance(version, str):
        raise InferenceError("Model metadata has no valid name and version.")

    return _InferenceSettings(
        roi_size=tuple(roi_size),
        sw_batch_size=sw_batch_size,
        overlap=float(overlap),
        normalize_nonzero=True,
        normalize_channel_wise=True,
        threshold=float(discretization["threshold"]),
        model_identifier=f"{model_name} {version}",
    )


class InferenceService:
    """Loads a local TorchScript model once and runs bundle-configured inference."""

    def __init__(
        self,
        model_path: str | Path | None = None,
        bundle_root: str | Path | None = None,
    ) -> None:
        default_bundle_root = (
            Path(__file__).resolve().parents[2]
            / "models"
            / "brats_mri_segmentation"
        )
        self.bundle_root = Path(bundle_root) if bundle_root else default_bundle_root
        self.model_path = (
            Path(model_path)
            if model_path is not None
            else self.bundle_root / "models" / MODEL_FILENAME
        )
        self.settings = _load_settings(self.bundle_root)
        self.device = torch.device(
            "cuda:0" if torch.cuda.is_available() else "cpu"
        )
        if not self.model_path.is_file():
            raise InferenceError(
                f"TorchScript model not found at {self.model_path}. "
                "Provide the licensed model.ts file or configure model_path."
            )

        try:
            self.model_sha256 = _sha256_model(self.model_path)
        except OSError as exc:
            raise InferenceError(
                "Could not calculate the TorchScript model integrity hash."
            ) from exc
        try:
            self.model = torch.jit.load(
                str(self.model_path),
                map_location=self.device,
            )
            self.model.eval()
        except Exception as exc:
            raise InferenceError(
                f"Could not load the TorchScript model on {self.device}. "
                "Check that model.ts is a valid compatible model."
            ) from exc

        self.inferer = SlidingWindowInferer(
            roi_size=self.settings.roi_size,
            sw_batch_size=self.settings.sw_batch_size,
            overlap=self.settings.overlap,
        )
        self.normalizer = NormalizeIntensity(
            nonzero=self.settings.normalize_nonzero,
            channel_wise=self.settings.normalize_channel_wise,
        )
        self.runtime_provenance = {
            "python_version": platform.python_version(),
            "numpy_version": np.__version__,
            "torch_version": str(torch.__version__),
            "monai_version": monai.__version__,
            "cuda_runtime_version": torch.version.cuda,
            "cudnn_version": (
                str(torch.backends.cudnn.version())
                if torch.backends.cudnn.version() is not None
                else None
            ),
            "device_name": (
                torch.cuda.get_device_name(self.device)
                if self.device.type == "cuda"
                else "CPU"
            ),
        }

    def infer(self, validated: ValidatedModalities) -> InferenceResult:
        shape = self._validate_input(validated)
        started_at = time.perf_counter()
        model_reference, image = self._prepare_model_input(validated)
        model_shape = tuple(int(size) for size in model_reference.shape)
        inputs = torch.from_numpy(np.ascontiguousarray(image)).to(
            dtype=torch.float32
        )
        inputs = self.normalizer(inputs).unsqueeze(0)
        if not torch.isfinite(inputs).all().item():
            raise InferenceError(
                "Configured intensity normalization produced non-finite values."
            )
        inputs = inputs.to(self.device)

        try:
            with (
                torch.inference_mode(),
                torch.autocast(
                    device_type=self.device.type,
                    enabled=self.device.type == "cuda",
                ),
            ):
                prediction = self.inferer(inputs, self.model)
                if not isinstance(prediction, torch.Tensor):
                    raise InferenceError(
                        "The model returned an unsupported output type."
                    )
                expected_shape = (1, 3, *model_shape)
                if tuple(prediction.shape) != expected_shape:
                    raise InferenceError(
                        "The model output shape does not match the expected "
                        f"{expected_shape}; received {tuple(prediction.shape)}."
                    )
                if not torch.isfinite(prediction).all().item():
                    raise InferenceError(
                        "The model returned non-finite prediction values."
                    )

                activated = torch.sigmoid(prediction)
                binary = activated >= self.settings.threshold
                segmentation = torch.zeros(
                    model_shape,
                    dtype=torch.uint8,
                    device=prediction.device,
                )
                segmentation[binary[0, 1]] = 2
                segmentation[binary[0, 0]] = 1
                segmentation[binary[0, 2]] = 4
                segmentation_array = segmentation.cpu().numpy()

                model_segmentation = nib.Nifti1Image(
                    segmentation_array,
                    model_reference.affine,
                )
                restored = resample_from_to(
                    model_segmentation,
                    (shape, np.asarray(validated["affine"], dtype=np.float64)),
                    order=0,
                    mode="constant",
                    cval=0,
                )
                segmentation_array = np.asarray(
                    restored.dataobj,
                    dtype=np.uint8,
                )
        except InferenceError:
            raise
        except Exception as exc:
            raise InferenceError(
                f"TorchScript inference failed on {self.device}. "
                "Check model compatibility and available device memory."
            ) from exc
        inference_seconds = time.perf_counter() - started_at

        if segmentation_array.shape != shape:
            raise InferenceError(
                "The generated segmentation shape does not match the input MRI "
                f"grid: expected {shape}, received {segmentation_array.shape}."
            )
        if not np.issubdtype(segmentation_array.dtype, np.integer):
            raise InferenceError("The generated segmentation is not integer-valued.")
        if not np.isin(segmentation_array, (0, 1, 2, 4)).all():
            raise InferenceError(
                "The generated segmentation contains an unsupported label."
            )

        affine = np.asarray(validated["affine"], dtype=np.float64).copy()
        spacing = tuple(float(value) for value in validated["spacing_mm"])
        return InferenceResult(
            segmentation=segmentation_array,
            output_shape=tuple(int(value) for value in segmentation_array.shape),
            affine=affine,
            spacing_mm=spacing,
            device=str(self.device),
            model_identifier=self.settings.model_identifier,
            inference_seconds=inference_seconds,
            model_sha256=self.model_sha256,
            runtime_provenance=self.runtime_provenance.copy(),
            validation_warnings=(),
            inference_configuration={
                "normalization": {
                    "nonzero": self.settings.normalize_nonzero,
                    "channel_wise": self.settings.normalize_channel_wise,
                },
                "sliding_window": {
                    "roi_size": list(self.settings.roi_size),
                    "sw_batch_size": self.settings.sw_batch_size,
                    "overlap": self.settings.overlap,
                },
                "activation": "sigmoid",
                "threshold": self.settings.threshold,
                "spatial_preprocessing": {
                    "orientation": "closest_canonical_RAS",
                    "model_spacing_mm": list(MODEL_SPACING_MM),
                    "intensity_interpolation": "trilinear",
                    "inverse_segmentation_interpolation": "nearest_neighbor",
                    "output_grid": "original_input_reference",
                },
                "output_channel_order": list(EXPECTED_OUTPUT_LABELS),
                "label_precedence": {"enhancing_tumor": 4, "tumor_core": 1, "whole_tumor": 2},
            },
        )

    @staticmethod
    def _validate_input(validated: Mapping[str, object]) -> tuple[int, int, int]:
        channel_order = validated.get("channel_order")
        if channel_order != REQUIRED_MODALITIES:
            raise InferenceError(
                "Validated modality order must be T1ce, T1, T2, FLAIR."
            )

        raw_shape = validated.get("shape")
        if (
            not isinstance(raw_shape, tuple)
            or len(raw_shape) != 3
            or any(type(dimension) is not int or dimension <= 0 for dimension in raw_shape)
        ):
            raise InferenceError("Validated MRI reference shape is invalid.")
        shape = raw_shape

        raw_arrays = validated.get("arrays")
        if not isinstance(raw_arrays, Mapping):
            raise InferenceError("Validated MRI voxel arrays are missing.")
        for modality in REQUIRED_MODALITIES:
            array = raw_arrays.get(modality)
            if not isinstance(array, np.ndarray) or array.shape != shape:
                raise InferenceError(
                    f"Validated {modality} array does not match reference shape "
                    f"{shape}."
                )
            if not np.issubdtype(array.dtype, np.number) or np.issubdtype(
                array.dtype,
                np.complexfloating,
            ):
                raise InferenceError(
                    f"Validated {modality} array must contain real numeric values."
                )
            if not np.isfinite(array).all():
                raise InferenceError(
                    f"Validated {modality} array contains non-finite values."
                )

        affine = np.asarray(validated.get("affine"), dtype=np.float64)
        if affine.shape != (4, 4) or not np.isfinite(affine).all():
            raise InferenceError("Validated MRI reference affine is invalid.")
        if abs(np.linalg.det(affine[:3, :3])) < 1e-10:
            raise InferenceError("Validated MRI reference affine is singular.")

        spacing = np.asarray(validated.get("spacing_mm"), dtype=np.float64)
        if (
            spacing.shape != (3,)
            or not np.isfinite(spacing).all()
            or np.any(spacing <= 0)
        ):
            raise InferenceError("Validated MRI voxel spacing is invalid.")
        affine_spacing = np.linalg.norm(affine[:3, :3], axis=0)
        if not np.allclose(affine_spacing, spacing, atol=1e-3, rtol=0):
            raise InferenceError(
                "MRI voxel spacing does not match its reference affine."
            )

        return shape

    @staticmethod
    def _prepare_model_input(
        validated: ValidatedModalities,
    ) -> tuple[nib.spatialimages.SpatialImage, np.ndarray]:
        images = validated.get("images")
        if not isinstance(images, Mapping) or any(
            modality not in images for modality in REQUIRED_MODALITIES
        ):
            raise InferenceError(
                "Validated MRI NIfTI images are required for spatial preprocessing."
            )

        try:
            canonical_reference = nib.as_closest_canonical(images["T1ce"])
            model_reference = resample_to_output(
                canonical_reference,
                voxel_sizes=MODEL_SPACING_MM,
                order=1,
            )
            target = (model_reference.shape, model_reference.affine)
            channels = []
            for modality in REQUIRED_MODALITIES:
                canonical_image = nib.as_closest_canonical(images[modality])
                resampled = resample_from_to(
                    canonical_image,
                    target,
                    order=1,
                    mode="constant",
                    cval=0,
                )
                channels.append(resampled.get_fdata(dtype=np.float32))
            image = np.stack(channels, axis=0)
        except Exception as exc:
            raise InferenceError(
                "Could not orient and resample MRI modalities to the model's "
                "1 mm canonical grid."
            ) from exc

        return model_reference, image


def _sha256_model(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
