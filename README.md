# NeuroScope 3D

NeuroScope 3D is a research and educational prototype for 3D brain MRI
segmentation. The repository contains a React/TypeScript frontend and a Python/FastAPI backend with MRI
validation, TorchScript inference, segmentation validation, NIfTI export,
measurements, integrity-passport utilities, and a local MRI segmentation API
workflow. The frontend uploads cases to that API, displays the uploaded MRI
and predicted-mask overlays, renders 3D surfaces from predicted labels,
reports measurements and integrity metadata, and downloads the actual mask
and JSON report. The API accepts an optional BraTS expert mask for per-case
region metrics.

**Research prototype only: this project is not a medical device and must not
be used for clinical diagnosis, treatment decisions, or emergency care.**
MRI validation and synthetic/model smoke tests do not establish diagnostic
accuracy on real patient scans. The bundled model is explicitly an example
not intended for diagnosis; the API is a research prototype, not a clinical
decision-support tool.
The 3D scene contains predicted-label surfaces only, not a reconstructed
brain surface. The repository does not include a held-out labelled evaluation
cohort, so it does not claim the challenge's 10-patient metrics.

## Repository structure

```text
backend/
  app/                       API entry point and MRI pipeline services
  tests/                     Backend and validation tests
  models/
    brats_mri_segmentation/   Model configuration, documentation, and licenses
  data/                      Local MRI samples; ignored by Git
  requirements.txt           Pinned Python dependencies
  download_sample.py         Optional MRI sample downloader
  README.md                  Backend-specific setup notes
frontend/
  src/                       React upload, slice, 3D, measurements and report UI
  README.md                  Frontend setup and API configuration
.gitignore
README.md
```

Model weights, downloaded model archives, node modules, build output, and MRI
scans are deliberately not stored in Git.

## Backend setup (Windows PowerShell)

Use Python 3.11. From the repository root:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
```

The PyTorch command installs the CUDA 12.8 wheel. GPU use additionally
requires a compatible NVIDIA GPU and driver. To check the installed runtime:

```powershell
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'No CUDA GPU detected')"
```

Start the development API from `backend/`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API health check is `http://127.0.0.1:8000/health`, readiness check is
`http://127.0.0.1:8000/health/ready`, and interactive documentation is
`http://127.0.0.1:8000/docs`. Use Swagger to upload `T1ce`, `T1`, `T2`, and
`FLAIR`, then segment the returned case ID. See
[backend/README.md](backend/README.md) for endpoints, configuration, upload
limits, and storage behavior. This API has no authentication and is for
localhost development only.

## Tests

Install pytest into the active environment, then run tests from `backend/`:

```powershell
python -m pip install pytest
python -m pytest
```

The MRI validation tests create temporary synthetic NIfTI files. They do not
download or require real patient scans. The API uses the separately obtained
TorchScript model for segmentation.

The backend also includes segmentation-grid validation, safe NIfTI export,
per-label volume measurements, and JSON integrity-passport utilities wired
into the local segmentation API workflow.
The API also removes stored cases automatically within 24 hours. An optional
expert mask can provide per-case Dice, sensitivity, and reference volumes;
this is not a substitute for patient-level held-out evaluation. See the
backend README for the prediction CLI and API details.

## Model and MRI data

The model bundle's configuration, documentation, and license files are
included under `backend/models/brats_mri_segmentation/`. Its weight files
(`model.pt` and `model.ts`) and the downloaded ZIP archive are excluded by
`.gitignore`. If obtaining model weights, use the
[MONAI Model Zoo bundle page](https://github.com/Project-MONAI/model-zoo/tree/dev/models/brats_mri_segmentation),
review the bundle license and data-use terms, and check compatibility with
the installed MONAI and PyTorch versions. Do not commit model weights.

`backend/download_sample.py` can download a sample case from the dataset
repository identified in that script. Before downloading or using MRI data,
review the dataset's access conditions and license. Local scan files under
`backend/data/` and NIfTI files anywhere in the repository are ignored by Git;
never commit patient data or credentials.

## Teammate setup

After the repository is published, clone it and repeat the backend setup
above:

```powershell
git clone https://github.com/Vallabh05/Neuroscope.git
cd Neuroscope\backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cu128
python -m pip install -r requirements.txt
python -m pip install pytest
python -m pytest
```

Each teammate should create their own virtual environment and obtain any
required model weights or data separately, following the applicable license
and access conditions.

## Frontend setup (Windows PowerShell)

Start the backend from `backend/`:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

In a separate PowerShell terminal, install and start the frontend:

```powershell
cd frontend
npm ci
npm run dev
```

Open the local Vite address printed in the terminal (normally
`http://127.0.0.1:5173`). The local Vite proxy forwards API requests to
FastAPI, so no CORS override or `VITE_API_BASE_URL` setting is needed for this
local setup. See
[frontend/README.md](frontend/README.md) for
setup, API configuration, and viewer limitations. The browser retains the
selected MRI files in memory for viewing and sends them only to the configured
FastAPI server. Backend case data is stored locally and expires automatically.
Neither service implements authentication; keep them on a trusted local
machine/network and do not expose the development server publicly.
