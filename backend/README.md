# NeuroScope 3D backend

This is the FastAPI scaffold for a research and educational prototype. It is
not for clinical diagnosis. The MRI prediction endpoint and preprocessing
pipeline are not implemented yet.

## Setup

Use Python 3.11, create and activate a virtual environment, then install the
backend dependencies:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
```

Run the development API from this directory:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The root endpoint is at `http://127.0.0.1:8000/`, the health endpoint is at
`http://127.0.0.1:8000/health`, and interactive API documentation is at
`http://127.0.0.1:8000/docs`.

Run the backend tests from this directory with:

```powershell
python -m unittest discover -s tests
```

## Model bundle

Model weights are intentionally excluded from Git. Obtain the
`brats_mri_segmentation` bundle from the
[official MONAI Model Zoo entry](https://github.com/Project-MONAI/model-zoo/tree/dev/models/brats_mri_segmentation),
review the bundle's `LICENSE` and `docs/data_license.txt`, and place the
extracted bundle under `models/brats_mri_segmentation/`. The checkpoint
expected by the future inference implementation is
`models/brats_mri_segmentation/models/model.pt`.

The currently present local bundle identifies itself as version 0.5.1 and was
created for MONAI 1.3.1 and PyTorch 2.2.2. Verify compatibility before using
it with different library versions. The model's stated intended use is
research/example purposes, not diagnosis; its benchmark scores do not
establish accuracy on a new scan or population.
