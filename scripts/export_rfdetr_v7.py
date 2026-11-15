#!/usr/bin/env python3
"""Export the RoadGuard AI Roboflow v7 RF-DETR Medium checkpoint to ONNX.

Usage:
    python scripts/export_rfdetr_v7.py --weights weights.pt

The browser scanner loads the resulting model from model/best.onnx.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from rfdetr import RFDETRMedium


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", default="weights.pt", help="Roboflow RF-DETR Medium checkpoint")
    parser.add_argument("--output", default="model/best.onnx", help="Final ONNX path used by dashboard.html")
    args = parser.parse_args()

    weights = Path(args.weights).resolve()
    output = Path(args.output).resolve()
    if not weights.is_file():
        raise SystemExit(f"Checkpoint not found: {weights}")

    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.parent / ".rfdetr_export"
    staging.mkdir(parents=True, exist_ok=True)

    print(f"Loading RF-DETR Medium checkpoint: {weights}")
    model = RFDETRMedium(pretrain_weights=str(weights))
    print("Exporting ONNX (this can take several minutes)...")
    exported = Path(model.export(
        output_dir=str(staging),
        output_name="best",
        format="onnx",
        batch_size=1,
    )).resolve()

    if not exported.is_file() or exported.stat().st_size < 1_000_000:
        raise SystemExit(f"Export did not produce a valid ONNX file: {exported}")

    try:
        import onnx
        graph = onnx.load(str(exported), load_external_data=True)
        onnx.checker.check_model(graph)
        input_names = [item.name for item in graph.graph.input]
        output_names = [item.name for item in graph.graph.output]
        print("ONNX validation passed.")
        print("Inputs:", input_names)
        print("Outputs:", output_names)
        if not any("dets" in name.lower() for name in output_names):
            raise SystemExit("Expected RF-DETR output 'dets' was not found.")
        if not any("labels" in name.lower() for name in output_names):
            raise SystemExit("Expected RF-DETR output 'labels' was not found.")
    except ImportError as exc:
        raise SystemExit('Missing ONNX validation package. Run: pip install "rfdetr[onnx]"') from exc

    shutil.copy2(exported, output)
    print(f"Ready: {output}")
    print(f"Size: {output.stat().st_size / (1024 * 1024):.1f} MB")
    print("Replace the repository's model/best.onnx with this file, then deploy the main branch.")


if __name__ == "__main__":
    main()
