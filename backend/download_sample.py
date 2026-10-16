
from pathlib import Path
import shutil

from huggingface_hub import hf_hub_download

REPO_ID = "MedOtter/brats2023-gli-dataset"
CASE_ID = "BraTS-GLI-00035-000"
FOLDER = (
    "ASNR-MICCAI-BraTS2023-GLI-Challenge-TrainingData/"
    f"{CASE_ID}/"
)

FILES = {
    "T1": f"{CASE_ID}-t1n.nii.gz",
    "T1ce": f"{CASE_ID}-t1c.nii.gz",
    "T2": f"{CASE_ID}-t2w.nii.gz",
    "FLAIR": f"{CASE_ID}-t2f.nii.gz",
}

OUTPUT_DIR = Path("data/sample_case")


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for modality, filename in FILES.items():
        destination = OUTPUT_DIR / f"{modality}.nii.gz"

        print(f"\nDownloading {modality}...")

        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            repo_type="dataset",
            filename=FOLDER + filename,
        )

        shutil.copy2(downloaded_path, destination)
        print(f"Saved: {destination.resolve()}")

    print("\nAll four MRI files downloaded successfully.")
    print(f"Output folder: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
