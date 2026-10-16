from fastapi import FastAPI

app = FastAPI(
    title="NeuroScope 3D API",
    description="Research and educational brain MRI segmentation prototype",
    version="0.1.0",
)


@app.get("/")
def root():
    return {
        "project": "NeuroScope 3D",
        "status": "running",
        "notice": "Research and educational prototype; not for clinical diagnosis.",
    }


@app.get("/health")
def health():
    import torch

    cuda_available = torch.cuda.is_available()
    return {
        "status": "ok",
        "cuda_available": cuda_available,
        "gpu": torch.cuda.get_device_name(0) if cuda_available else None,
    }
