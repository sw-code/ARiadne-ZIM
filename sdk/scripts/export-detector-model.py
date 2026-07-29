"""
Exports the on-device object detection model for ViroObjectDetector.

The stock prompt-free YOLOE model spreads its confidence over 4585 classes and rarely
reports the street furniture we care about. Baking our own class list into the detection
head (YOLOE RepRTA) gives much higher recall for exactly these classes.

The export parameters mirror ReactVision's reference script
(github.com/ReactVision/react-viro-onnx, scripts/export_text_model.py),
because the native consumer expects its output layout (end2end NMS, output0 [1,300,38]).

Usage (Python >= 3.10):
    python3 -m venv .venv && .venv/bin/pip install ultralytics onnx onnxruntime
    .venv/bin/python scripts/export-detector-model.py assets/models/poi-detector.onnx
    .venv/bin/python -m unittest discover -s scripts
"""

import os
import sys

import onnx

from onnx_extensions import replace_splits_with_slices

# Chosen after the most frequent OSM subtypes around Soest (see the embedded Overpass dataset),
# restricted to objects that are recognisable in a camera image, plus traffic for danger warnings.
CLASSES = [
    # amenity / tourism / historic POIs
    "bench",
    "memorial",
    "statue",
    "sculpture",
    "information board",
    "signpost",
    "bicycle rack",
    "trash can",
    "vending machine",
    "mailbox",
    "public clock",
    "fountain",
    "church",
    "bus shelter",
    "kiosk",
    "ev charging station",
    # shops, restaurants and cafes are recognisable by their facades
    "storefront",
    "shop sign",
    "outdoor seating",
    # traffic, relevant for danger recognition
    "person",
    "car",
    "bicycle",
    "bus",
    "traffic light",
    "street sign",
]

WEIGHTS = "yoloe-26n-seg.pt"


def main():
    from ultralytics import YOLOE

    output_path = sys.argv[1]
    model = YOLOE(WEIGHTS)
    model.set_classes(CLASSES, model.get_text_pe(CLASSES))
    exported_path = model.export(format="onnx", imgsz=640, nms=True, opset=19, simplify=False)
    exported_model = onnx.load(exported_path)
    # Viro's Android detector tries ONNX Runtime's NNAPI execution provider first.
    replace_splits_with_slices(exported_model)
    onnx.save(exported_model, output_path)
    os.remove(exported_path)
    print(f"exported {len(CLASSES)} classes to {output_path}")


if __name__ == "__main__":
    main()
