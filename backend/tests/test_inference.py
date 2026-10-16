from unittest.mock import patch

import numpy as np
import pytest
import torch
from monai.transforms import NormalizeIntensity

from app.services.inference import InferenceError, InferenceService


class FakeModel(torch.nn.Module):
    def __init__(self, output):
        super().__init__()
        self.output = output
        self.last_input = None

    def forward(self, inputs):
        self.last_input = inputs.detach().cpu()
        return self.output


class FailingModel(torch.nn.Module):
    def forward(self, inputs):
        raise RuntimeError("inference failure")


class DirectInferer:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def __call__(self, inputs, network):
        return network(inputs)


@pytest.fixture
def validated_modalities():
    shape = (8, 8, 8)
    affine = np.diag([1.5, 1.5, 2.0, 1.0])
    return {
        "arrays": {
            "T1ce": np.arange(1, 513, dtype=np.float32).reshape(shape),
            "T1": np.arange(2, 514, dtype=np.float32).reshape(shape),
            "T2": np.arange(3, 515, dtype=np.float32).reshape(shape),
            "FLAIR": np.arange(4, 516, dtype=np.float32).reshape(shape),
        },
        "shape": shape,
        "affine": affine,
        "spacing_mm": np.array([1.5, 1.5, 2.0]),
        "channel_order": ("T1ce", "T1", "T2", "FLAIR"),
    }


def create_service(output):
    model = FakeModel(output)
    with (
        patch("app.services.inference.torch.cuda.is_available", return_value=False),
        patch("app.services.inference.torch.jit.load", return_value=model) as load,
        patch(
            "app.services.inference.SlidingWindowInferer",
            side_effect=lambda **kwargs: DirectInferer(**kwargs),
        ) as inferer_factory,
    ):
        service = InferenceService()

    return service, model, load, inferer_factory


def make_logits(shape=(8, 8, 8)):
    logits = torch.full((1, 3, *shape), -10.0)
    logits[0, 0, 0, 0, 0] = 10.0
    logits[0, 1, 0, 0, 1] = 10.0
    logits[0, 0, 0, 0, 2] = 10.0
    logits[0, 1, 0, 0, 2] = 10.0
    logits[0, 0, 0, 0, 3] = 10.0
    logits[0, 1, 0, 0, 3] = 10.0
    logits[0, 2, 0, 0, 3] = 10.0
    return logits


def test_inference_uses_bundle_settings_and_preserves_reference_geometry(
    validated_modalities,
):
    service, model, load, inferer_factory = create_service(make_logits())
    result = service.infer(validated_modalities)

    load.assert_called_once()
    assert load.call_args.kwargs["map_location"] == torch.device("cpu")
    assert inferer_factory.call_args.kwargs == {
        "roi_size": (240, 240, 160),
        "sw_batch_size": 1,
        "overlap": 0.5,
    }
    assert model.training is False
    assert model.last_input.shape == (1, 4, 8, 8, 8)
    assert result.segmentation.shape == validated_modalities["shape"]
    assert result.segmentation.dtype == np.uint8
    assert result.segmentation[0, 0, 0] == 1
    assert result.segmentation[0, 0, 1] == 2
    assert result.segmentation[0, 0, 2] == 1
    assert result.segmentation[0, 0, 3] == 4
    assert set(np.unique(result.segmentation)).issubset({0, 1, 2, 4})
    np.testing.assert_array_equal(result.affine, validated_modalities["affine"])
    assert result.spacing_mm == (1.5, 1.5, 2.0)
    assert result.device == "cpu"
    assert result.model_identifier == "BraTS MRI segmentation 0.5.1"
    assert result.inference_seconds >= 0


def test_service_loads_model_once_and_normalizes_in_documented_channel_order(
    validated_modalities,
):
    service, model, load, _ = create_service(make_logits())

    service.infer(validated_modalities)
    service.infer(validated_modalities)

    load.assert_called_once()
    raw_image = np.stack(
        [
            validated_modalities["arrays"][modality]
            for modality in ("T1ce", "T1", "T2", "FLAIR")
        ]
    )
    expected_input = NormalizeIntensity(nonzero=True, channel_wise=True)(
        torch.from_numpy(raw_image)
    ).unsqueeze(0)
    torch.testing.assert_close(model.last_input, expected_input)


def test_invalid_model_output_shape_is_rejected(validated_modalities):
    service, _, _, _ = create_service(torch.zeros((1, 3, 4, 8, 8)))

    with pytest.raises(InferenceError, match="output shape"):
        service.infer(validated_modalities)


def test_non_finite_model_output_is_rejected(validated_modalities):
    output = make_logits()
    output[0, 0, 0, 0, 0] = float("nan")
    service, _, _, _ = create_service(output)

    with pytest.raises(InferenceError, match="non-finite"):
        service.infer(validated_modalities)


def test_threshold_includes_probability_equal_to_one_half(validated_modalities):
    output = torch.zeros((1, 3, 8, 8, 8))
    service, _, _, _ = create_service(output)

    result = service.infer(validated_modalities)

    assert np.all(result.segmentation == 4)


def test_invalid_validated_modality_order_is_rejected(validated_modalities):
    service, _, _, _ = create_service(make_logits())
    validated_modalities["channel_order"] = ("T1", "T1ce", "T2", "FLAIR")

    with pytest.raises(InferenceError, match="modality order"):
        service.infer(validated_modalities)


def test_non_numeric_validated_array_is_rejected(validated_modalities):
    service, _, _, _ = create_service(make_logits())
    validated_modalities["arrays"]["T1"] = np.full(
        validated_modalities["shape"],
        "not numeric",
    )

    with pytest.raises(InferenceError, match="real numeric values"):
        service.infer(validated_modalities)


def test_missing_torchscript_model_has_actionable_error(tmp_path):
    with patch("app.services.inference.torch.cuda.is_available", return_value=False):
        with pytest.raises(InferenceError, match="TorchScript model not found"):
            InferenceService(model_path=tmp_path / "missing.ts")


def test_torchscript_load_failure_has_actionable_error(tmp_path):
    model_path = tmp_path / "model.ts"
    model_path.write_bytes(b"not a model")
    with (
        patch("app.services.inference.torch.cuda.is_available", return_value=False),
        patch(
            "app.services.inference.torch.jit.load",
            side_effect=RuntimeError("load failure"),
        ),
    ):
        with pytest.raises(InferenceError, match="Could not load the TorchScript model"):
            InferenceService(model_path=model_path)


def test_torchscript_inference_failure_is_reported(validated_modalities):
    with (
        patch("app.services.inference.torch.cuda.is_available", return_value=False),
        patch("app.services.inference.torch.jit.load", return_value=FailingModel()),
        patch(
            "app.services.inference.SlidingWindowInferer",
            side_effect=lambda **kwargs: DirectInferer(**kwargs),
        ),
    ):
        service = InferenceService()

    with pytest.raises(InferenceError, match="TorchScript inference failed"):
        service.infer(validated_modalities)
