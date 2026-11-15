# RoadGuard AI model

The dashboard supports both the previous YOLO ONNX format and the RoadGuard RF-DETR Medium v7 model.

## Export the v7 checkpoint

Use Python 3.10 or 3.11 on a machine with internet access:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install "rfdetr[onnx]"
python scripts/export_rfdetr_v7.py --weights weights.pt
```

The script writes the validated ONNX model to `model/best.onnx`. The checkpoint must be the `weights.pt` file from the RoadGuard RF-DETR Medium v7 training.

Then replace the tracked `model/best.onnx` with the generated file and push the change. Keep the model file at this exact path: the browser scanner loads `./model/best.onnx`.

## Class order

The RF-DETR v7 class order is taken from the v7 `data.yaml`:

0. Alligator Crack
1. Longitudinal Crack
2. Normal Road
3. Open Manhole
4. Pothole
5. Transverse Crack

Normal Road is intentionally excluded from damage reports. RF-DETR uses the final output logit as its no-object slot. The browser decoder reads the ONNX outputs by their names (`dets` and `labels`) and uses normalized center-width-height boxes.

## Important dataset limitation

The v7 export ZIP places 204 images in an `export/` split rather than train/valid/test. The Alligator Crack examples are present in that export split, but no Alligator Crack labels appear in the train, validation, or test splits. Therefore, the current trained checkpoint should not be treated as validated for Alligator Crack until those images are moved into the training split and the model is retrained/evaluated.
