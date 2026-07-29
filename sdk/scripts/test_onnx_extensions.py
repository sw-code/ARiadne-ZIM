import unittest
from collections.abc import Callable

import numpy as np
import onnx
import onnxruntime
from onnx import TensorProto, helper

from onnx_extensions import replace_splits_with_slices

INPUT_SHAPE = [1, 8, 3]
SPLIT_SIZES = [2, 2, 4]
SPLIT_SIZES_NAME = "split_sizes"


def split_sizes_constant() -> onnx.NodeProto:
    sizes = helper.make_tensor(SPLIT_SIZES_NAME, TensorProto.INT64, [len(SPLIT_SIZES)], SPLIT_SIZES)
    return helper.make_node("Constant", [], [SPLIT_SIZES_NAME], value=sizes)


def uneven_split(name: str) -> tuple[onnx.NodeProto, list[onnx.ValueInfoProto]]:
    outputs = [f"{name}_{index}" for index in range(len(SPLIT_SIZES))]
    split = helper.make_node("Split", ["x", SPLIT_SIZES_NAME], outputs, name=name, axis=1)
    output_infos = [
        helper.make_tensor_value_info(output, TensorProto.FLOAT, [1, size, INPUT_SHAPE[2]])
        for output, size in zip(outputs, SPLIT_SIZES, strict=True)
    ]
    return split, output_infos


def model_of(nodes: list[onnx.NodeProto], outputs: list[onnx.ValueInfoProto]) -> onnx.ModelProto:
    graph = helper.make_graph(
        nodes, "splits", [helper.make_tensor_value_info("x", TensorProto.FLOAT, INPUT_SHAPE)], outputs
    )
    # IR version of the exported detector model; onnx defaults to a newer one than ONNX Runtime reads.
    return helper.make_model(graph, opset_imports=[helper.make_opsetid("", 19)], ir_version=9)


def uneven_split_model() -> onnx.ModelProto:
    split, outputs = uneven_split("split")
    return model_of([split_sizes_constant(), split], outputs)


def shared_split_sizes_model() -> onnx.ModelProto:
    """Like the exported detector, several Splits share one sizes constant; here another node reads it too."""
    first_split, first_outputs = uneven_split("first")
    second_split, second_outputs = uneven_split("second")
    sizes_reader = helper.make_node("Cast", [SPLIT_SIZES_NAME], ["sizes_as_float"], to=TensorProto.FLOAT)
    sizes_output = helper.make_tensor_value_info("sizes_as_float", TensorProto.FLOAT, [len(SPLIT_SIZES)])
    return model_of(
        [split_sizes_constant(), first_split, second_split, sizes_reader],
        [*first_outputs, *second_outputs, sizes_output],
    )


def run(model: onnx.ModelProto, x: np.ndarray) -> list[np.ndarray]:
    session = onnxruntime.InferenceSession(model.SerializeToString(), providers=["CPUExecutionProvider"])
    return session.run(None, {"x": x})


class ReplaceSplitsWithSlicesTest(unittest.TestCase):
    def test_no_split_remains(self) -> None:
        model = uneven_split_model()

        replace_splits_with_slices(model)

        onnx.checker.check_model(model, full_check=True)
        self.assertNotIn("Split", [node.op_type for node in model.graph.node])

    def test_unused_split_sizes_are_removed(self) -> None:
        model = uneven_split_model()

        replace_splits_with_slices(model)

        self.assertNotIn(SPLIT_SIZES_NAME, [output for node in model.graph.node for output in node.output])

    def test_outputs_are_unchanged(self) -> None:
        self.assert_outputs_unchanged(uneven_split_model)

    def test_outputs_are_unchanged_when_splits_share_their_sizes(self) -> None:
        self.assert_outputs_unchanged(shared_split_sizes_model)

    def assert_outputs_unchanged(self, make_model: Callable[[], onnx.ModelProto]) -> None:
        x = np.random.default_rng(0).random(INPUT_SHAPE, dtype=np.float32)
        expected = run(make_model(), x)
        model = make_model()

        replace_splits_with_slices(model)

        onnx.checker.check_model(model, full_check=True)
        for actual_output, expected_output in zip(run(model, x), expected, strict=True):
            np.testing.assert_array_equal(actual_output, expected_output)


if __name__ == "__main__":
    unittest.main()
