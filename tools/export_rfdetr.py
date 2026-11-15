#!/usr/bin/env python3
"""Export the RoadGuard RF-DETR Medium checkpoint to ONNX.

Run from the repository root:
  python -m pip install -r tools/requirements-rfdetr.txt
  python tools/export_rfdetr.py --weights weights.pt

The uploaded checkpoint does not contain class-name metadata. Before enabling
the exported model in the browser, verify model/roadguard-rfdetr-medium.metadata.json
classNames against the class order in Roboflow dataset version 7's data.yaml,
then rerun with --confirm-class-order.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "model"
MODEL_STEM = "roadguard-rfdetr-medium"
METADATA_PATH = MODEL_DIR / f"{MODEL_STEM}.metadata.json"
DEFAULT_CLASSES = [
    "Pothole",
    "Longitudinal Crack",
    "Transverse Crack",
    "Alligator Crack",
    "Open Manhole",
    "Normal Road",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, default=ROOT / "weights.pt")
    parser.add_argument(
        "--confirm-class-order",
        action="store_true",
        help="Set only after classNames has been checked against version 7 data.yaml.",
    )
    args = parser.parse_args()

    weights = args.weights.resolve()
    if not weights.is_file():
        raise SystemExit(f"Checkpoint not found: {weights}")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if METADATA_PATH.exists():
        metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
        class_names = metadata.get("classNames")
    else:
        class_names = DEFAULT_CLASSES

    if not isinstance(class_names, list) or len(class_names) != 6:
        raise SystemExit(
            "Expected exactly six classNames in "
            f"{METADATA_PATH}. Do not guess the model's class-index order."
        )

    # The uploaded file is the user's own training checkpoint. trust_checkpoint
    # permits RF-DETR's documented fallback for trusted pickle checkpoints.
    from rfdetr import RFDETRMedium

    model = RFDETRMedium(pretrain_weights=str(weights), trust_checkpoint=True)
    num_classes = int(model.model_config.num_classes)
    if num_classes != len(class_names):
        raise SystemExit(
            f"Checkpoint head has {num_classes} classes, but metadata lists "
            f"{len(class_names)}. Refusing to export with a mismatched class map."
        )

    input_size = int(model.model_config.resolution)
    output_path = MODEL_DIR / f"{MODEL_STEM}.onnx"
    model.export(
        output_dir=str(MODEL_DIR),
        format="onnx",
        output_name=MODEL_STEM,
        opset_version=17,
        batch_size=1,
        dynamic_batch=False,
        fp16=False,
    )
    if not output_path.is_file():
        raise SystemExit(f"Export finished but expected file is missing: {output_path}")

    metadata = {
        "format": "rfdetr",
        "architecture": "RF-DETR Medium",
        "inputSize": input_size,
        "classNames": class_names,
        "backgroundClassId": -1,
        "confidenceThreshold": 0.45,
        "normalization": {
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
        "classOrderVerified": bool(args.confirm_class_order),
        "checkpoint": weights.name,
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"ONNX exported: {output_path}")
    print(f"Metadata written: {METADATA_PATH}")
    if not args.confirm_class_order:
        print(
            "IMPORTANT: classOrderVerified=false. Check classNames against "
            "Roboflow version 7 data.yaml, edit the JSON if needed, then rerun "
            "with --confirm-class-order before using this model in the browser."
        )


if __name__ == "__main__":
    main()
