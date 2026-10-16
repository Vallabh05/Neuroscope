import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class ApiScaffoldTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root_returns_prototype_notice(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["project"], "NeuroScope 3D")
        self.assertEqual(response.json()["status"], "running")
        self.assertIn("not for clinical diagnosis", response.json()["notice"])

    def test_health_reports_gpu_when_cuda_is_available(self):
        with (
            patch("torch.cuda.is_available", return_value=True),
            patch("torch.cuda.get_device_name", return_value="Test GPU"),
        ):
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "ok",
            "cuda_available": True,
            "gpu": "Test GPU",
        })

    def test_health_omits_gpu_name_when_cuda_is_unavailable(self):
        with (
            patch("torch.cuda.is_available", return_value=False),
            patch("torch.cuda.get_device_name") as get_device_name,
        ):
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {
            "status": "ok",
            "cuda_available": False,
            "gpu": None,
        })
        get_device_name.assert_not_called()


if __name__ == "__main__":
    unittest.main()
