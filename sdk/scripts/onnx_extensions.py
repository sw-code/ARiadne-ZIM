import itertools

import numpy as np
import onnx
from onnx import helper, numpy_helper


def replace_splits_with_slices(model: onnx.ModelProto) -> None:
    """Replaces every Split node with one Slice node per output, which compute the same values.

    ONNX Runtime's NNAPI execution provider (1.22) cannot take these Splits: it rejects uneven
    split sizes, and for even ones from opset 18 on it reads the size count from a `num_outputs`
    attribute that PyTorch's exporter never writes (session creation then fails with
    "count [0] does not evenly divide dimension"). Slice with constant bounds has neither problem.
    """
    graph = model.graph
    constants = _constant_values(graph)
    split_sizes_names = {node.input[1] for node in graph.node if node.op_type == "Split"}
    nodes = []
    for node in graph.node:
        if node.op_type == "Split":
            nodes.extend(_slices_for_split(node, constants[node.input[1]], graph))
        else:
            nodes.append(node)

    unused_names = split_sizes_names - {name for node in nodes for name in node.input}
    del graph.node[:]
    graph.node.extend(node for node in nodes if not (node.op_type == "Constant" and node.output[0] in unused_names))
    initializers = [initializer for initializer in graph.initializer if initializer.name not in unused_names]
    del graph.initializer[:]
    graph.initializer.extend(initializers)


def _constant_values(graph: onnx.GraphProto) -> dict[str, np.ndarray]:
    values = {initializer.name: numpy_helper.to_array(initializer) for initializer in graph.initializer}
    for node in graph.node:
        if node.op_type == "Constant":
            values[node.output[0]] = numpy_helper.to_array(helper.get_attribute_value(node.attribute[0]))
    return values


def _slices_for_split(split: onnx.NodeProto, sizes: np.ndarray, graph: onnx.GraphProto) -> list[onnx.NodeProto]:
    axis = next((helper.get_attribute_value(a) for a in split.attribute if a.name == "axis"), 0)
    axes_name = f"{split.name}/axes"
    graph.initializer.append(numpy_helper.from_array(np.array([axis], dtype=np.int64), axes_name))
    ends = list(itertools.accumulate(sizes.tolist()))
    starts = [0, *ends[:-1]]
    slices = []
    for index, (output, start, end) in enumerate(zip(split.output, starts, ends, strict=True)):
        starts_name = f"{split.name}/starts_{index}"
        ends_name = f"{split.name}/ends_{index}"
        graph.initializer.append(numpy_helper.from_array(np.array([start], dtype=np.int64), starts_name))
        graph.initializer.append(numpy_helper.from_array(np.array([end], dtype=np.int64), ends_name))
        slices.append(
            helper.make_node(
                "Slice",
                [split.input[0], starts_name, ends_name, axes_name],
                [output],
                name=f"{split.name}/slice_{index}",
            )
        )
    return slices
