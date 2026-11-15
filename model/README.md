# RoadGuard AI model files

- `best.onnx` is the existing YOLO-format backup and is intentionally retained.
- `roadguard-rfdetr-medium.onnx` is generated locally from the uploaded `weights.pt` checkpoint using `tools/export_rfdetr.py`.
- `roadguard-rfdetr-medium.metadata.json` defines preprocessing and class-index mapping.

Do not commit the original 134 MB `.pt` checkpoint. The RF-DETR ONNX file may also exceed GitHub's 100 MB per-file limit; if it does, host it in an object store or Git LFS and update the model URL in `dashboard.html`.

The checkpoint does not embed class names. Confirm the six class IDs against Roboflow version 7's exported `data.yaml` before setting `classOrderVerified` to `true`. The scanner will keep using the legacy backup until this is confirmed.
