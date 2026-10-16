# NeuroScope 3D

NeuroScope 3D is a research and educational prototype for 3D brain MRI
segmentation. The current repository contains a Python/FastAPI backend and
MRI modality validation utilities. A user-facing frontend and the MRI
prediction API workflow have not been added yet.

**Research prototype only: this project is not a medical device and must not
be used for clinical diagnosis, treatment decisions, or emergency care.**
MRI validation and synthetic/model smoke tests do not establish diagnostic
accuracy on real patient scans.

## Repository structure

```text
backend/
  app/                       FastAPI application and MRI validation service
  tests/                     Backend and validation tests
  models/
    brats_mri_segmentation/   Model configuration, documentation, and licenses
  data/                      Local MRI samples; ignored by Git
  requirements.txt           Pinned Python dependencies
  download_sample.py         Optional MRI sample downloader
  README.md                  Backend-specific setup notes
.gitignore
README.md
```

There is no frontend directory yet. Model weights, downloaded model archives,
and MRI scans are deliberately not stored in Git.

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

The API root is `http://127.0.0.1:8000/`, health check is
`http://127.0.0.1:8000/health`, and interactive documentation is
`http://127.0.0.1:8000/docs`.

## Tests

Install pytest into the active environment, then run tests from `backend/`:

```powershell
python -m pip install pytest
python -m pytest
python -m unittest discover -s tests
```

The MRI validation tests create temporary synthetic NIfTI files. They do not
download or require real patient scans.

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
