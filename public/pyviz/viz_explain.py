"""Sub-steps that break one line of indexing into a picture.

sys.settrace only ever sees the gaps *between* lines, so `b = a[1:, 1:3]` is a
single jump: you see the source, then the answer, and nothing about which cells
were chosen. This module reads the AST of the line that is *about to* run and,
when it recognises the shape, replays the index expression against a probe array
to work out exactly which cells are involved. The result is appended to the
trace as extra `event="explain"` entries that borrow the parent step's frames
and objects and add a highlight mask on top.

Safety rule: an explainer runs BEFORE the real line does and must be read-only.
It re-evaluates the user's own expression, so only expressions that are free of
side effects and give the same answer twice are ever touched -- see is_safe.
"""

import ast

try:
    import numpy as _np
except ImportError:
    _np = None

try:
    import pandas as _pd
except ImportError:
    _pd = None

import viz_snap

MISSING = object()
PROBE = "__viz_probe__"      # name we bind the index array to
MAX_CELLS = 400              # a bigger grid is unreadable anyway
MAX_EXPLAIN_TOTAL = 120      # ceiling for one whole trace
MAX_EXPLAIN_PER_LINE = 3     # a line in a loop is explained for a few passes only

# Calls we are willing to re-run: same answer every time, no side effects.
# Anything else (a user function, np.random.rand) means the line is skipped
# rather than risk running a side effect twice or drawing a picture of values
# that differ from the ones the program actually used.
SAFE_METHODS = {
    "arange", "array", "asarray", "zeros", "ones", "full", "eye", "linspace",
    "reshape", "transpose", "ravel", "flatten", "squeeze", "swapaxes",
    "astype", "copy", "sum", "mean", "min", "max", "prod", "std", "var",
    "any", "all", "argmin", "argmax",
    "DataFrame", "Series", "head", "tail", "reset_index", "set_index",
    "sort_values", "sort_index", "abs", "round", "dropna", "fillna",
}


# ------------------------------------------------------------------- AST work

def is_safe(node):
    """Can this expression be evaluated a second time without consequences?"""
    if node is None:
        return True
    if isinstance(node, (ast.Name, ast.Constant)):
        return True
    if isinstance(node, ast.Attribute):
        return is_safe(node.value)
    if isinstance(node, ast.Subscript):
        return is_safe(node.value) and is_safe(node.slice)
    if isinstance(node, ast.Slice):
        return all(is_safe(p) for p in (node.lower, node.upper, node.step))
    if isinstance(node, (ast.Tuple, ast.List)):
        return all(is_safe(item) for item in node.elts)
    if isinstance(node, ast.BinOp):
        return is_safe(node.left) and is_safe(node.right)
    if isinstance(node, ast.UnaryOp):
        return is_safe(node.operand)
    if isinstance(node, ast.Compare):
        return is_safe(node.left) and all(is_safe(c) for c in node.comparators)
    if isinstance(node, ast.Call):
        # only bound methods from the list above; never a bare function call
        if not isinstance(node.func, ast.Attribute) or node.func.attr not in SAFE_METHODS:
            return False
        return (is_safe(node.func.value)
                and all(is_safe(a) for a in node.args)
                and all(is_safe(k.value) for k in node.keywords))
    return False


def statement_value(stmt):
    """The right-hand side of a statement, or None if we cannot explain it."""
    if isinstance(stmt, (ast.Assign, ast.AnnAssign, ast.Expr)):
        return stmt.value
    return None


def safe_eval(node, env):
    if node is None:
        return MISSING
    try:
        expr = ast.Expression(body=node)
        ast.fix_missing_locations(expr)
        return eval(compile(expr, "<explain>", "eval"), env)
    except Exception:
        return MISSING


def unparse(node):
    try:
        return ast.unparse(node)
    except Exception:
        return "…"


def too_big(value):
    if _np is not None and isinstance(value, _np.ndarray):
        return value.size > MAX_CELLS
    if _pd is not None and isinstance(value, _pd.DataFrame):
        return value.shape[0] * value.shape[1] > MAX_CELLS
    if _pd is not None and isinstance(value, _pd.Series):
        return value.shape[0] > MAX_CELLS
    return False


def shape_text(shape):
    return " × ".join(str(int(n)) for n in shape) if len(shape) else "0-D"


# ---------------------------------------------------------------------- masks

def _probe_array(arr):
    """An array whose cells hold their own flat position.

    The whole trick: push this through the user's own index expression and see
    where the numbers land. That answers "which cells were picked" for slices,
    fancy indexing and boolean masks with one piece of code.
    """
    return _np.arange(arr.size).reshape(arr.shape)


def _mask_from_picked(arr, picked):
    mask = _np.zeros(arr.size, dtype=bool)
    flat = _np.asarray(picked).ravel()
    if flat.size:
        mask[flat.astype(int)] = True
    return mask.reshape(arr.shape)


def _numpy_mask(subscript_node, src, env):
    probe = ast.Subscript(value=ast.Name(id=PROBE, ctx=ast.Load()),
                          slice=subscript_node.slice, ctx=ast.Load())
    ast.copy_location(probe, subscript_node)
    scope = dict(env)
    scope[PROBE] = _probe_array(src)
    picked = safe_eval(probe, scope)
    if picked is MISSING:
        return None
    return _mask_from_picked(src, picked)


def _pandas_mask(src, node, env):
    """df["col"], df[["a", "b"]] and df[boolean] -> a cell mask."""
    key = safe_eval(node.slice, env)
    if key is MISSING:
        return None
    mask = _np.zeros(src.shape, dtype=bool)

    wanted = None
    if not isinstance(key, (list, tuple, _pd.Series, _np.ndarray)):
        if key in src.columns:
            wanted = [key]
    elif isinstance(key, (list, tuple)) and all(k in src.columns for k in key):
        wanted = list(key)
    if wanted is not None:
        for i, column in enumerate(src.columns):
            if column in wanted:
                mask[:, i] = True
        return mask

    # df[df["score"] > 8] -- whole rows
    flags = _np.asarray(key)
    if flags.dtype == bool and flags.shape == (src.shape[0],):
        mask[flags, :] = True
        return mask
    return None


# -------------------------------------------------------------------- payload

def _box(label, value, highlight=None, note=None):
    item = {"label": label, "snap": viz_snap.snap(value, highlight)}
    if note:
        item["note"] = note
    return item


def _substep(op, title, boxes, note=None):
    payload = {"op": op, "title": title, "boxes": boxes}
    if note:
        payload["note"] = note
    return payload


# --------------------------------------------------------------- the explainer

def _explain_write(stmt, env):
    """a[a < 0] = 0 -- which cells are about to be overwritten."""
    target = stmt.targets[0]
    src = safe_eval(target.value, env)
    name = unparse(target.value)

    if _np is not None and isinstance(src, _np.ndarray):
        if src.ndim == 0 or too_big(src):
            return None
        mask = _numpy_mask(target, src, env)
    elif _pd is not None and isinstance(src, _pd.DataFrame) and not too_big(src):
        mask = _pandas_mask(src, target, env)
    else:
        return None
    if mask is None:
        return None

    count = int(mask.sum())
    return [_substep(
        "write",
        "%s picks %d %s — about to be overwritten" % (
            unparse(target), count, "cell" if count == 1 else "cells"),
        [_box(name, src, mask)],
        note="the assignment happens in place, so %s itself changes" % name,
    )]


def _explain_read(node, env):
    """b = a[1:, 1:3] -- which cells are selected, and is the result a view."""
    src = safe_eval(node.value, env)
    name = unparse(node.value)

    if _np is not None and isinstance(src, _np.ndarray):
        if src.ndim == 0 or too_big(src):
            return None
        mask = _numpy_mask(node, src, env)
        total = src.size
    elif _pd is not None and isinstance(src, (_pd.DataFrame,)) and not too_big(src):
        mask = _pandas_mask(src, node, env)
        total = src.shape[0] * src.shape[1]
    else:
        return None
    if mask is None:
        return None

    count = int(mask.sum())
    steps = [_substep(
        "read",
        "%s selects the highlighted cells" % unparse(node),
        [_box(name, src, mask)],
        note="%d of %d cells" % (count, total),
    )]

    # safe: we already know the receiver is an ndarray or a DataFrame, and
    # __getitem__ on either has no side effects
    result = safe_eval(node, env)
    if result is MISSING or viz_snap.snap(result) is None:
        return steps

    note = None
    if _np is not None and isinstance(result, _np.ndarray) and isinstance(src, _np.ndarray):
        if _np.shares_memory(result, src):
            note = ("the result is a view — it shares memory with %s, "
                    "so writing to it writes through" % name)
        else:
            note = "the result is a copy — it owns its own buffer"

    shape = getattr(result, "shape", ())
    steps.append(_substep("read", "result: %s" % shape_text(shape),
                          [_box("result", result)], note=note))
    return steps


def explain(stmt, env):
    """Sub-steps for one statement -- empty when nothing here is explainable."""
    if _np is None:
        return []

    if (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1
            and isinstance(stmt.targets[0], ast.Subscript)):
        if not is_safe(stmt.targets[0]):
            return []
        return _explain_write(stmt, env) or []

    node = statement_value(stmt)
    if not isinstance(node, ast.Subscript) or not is_safe(node):
        return []
    return _explain_read(node, env) or []


# ------------------------------------------------------------------- the hook

class _State:
    def __init__(self, source):
        self.statements = {}
        self.tried = {}
        self.hopeless = set()
        self.total = 0
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign, ast.Expr)):
                # one statement per line: `x = 1; y = 2` explains only the first
                self.statements.setdefault(node.lineno, node)


def install(pg_logger):
    """Wrap PGLogger.interaction so sub-steps land right after their parent."""
    original = pg_logger.PGLogger.interaction

    def interaction(self, frame, traceback, event_type):
        before = len(self.trace)
        original(self, frame, traceback, event_type)
        if event_type != "step_line" or len(self.trace) <= before:
            return
        try:
            _append_substeps(self, frame)
        except Exception:
            # explaining is a bonus; it must never take the trace down with it
            pass

    pg_logger.PGLogger.interaction = interaction


def _append_substeps(logger, frame):
    state = getattr(logger, "_viz_state", None)
    if state is None:
        state = _State(logger.executed_script or "")
        logger._viz_state = state
    if state.total >= MAX_EXPLAIN_TOTAL:
        return

    parent_index = len(logger.trace) - 1
    parent = logger.trace[parent_index]
    line = parent.get("line")
    if line in state.hopeless:
        return
    stmt = state.statements.get(line)
    if stmt is None:
        state.hopeless.add(line)
        return
    seen = state.tried.get(line, 0)
    if seen >= MAX_EXPLAIN_PER_LINE:
        return
    state.tried[line] = seen + 1

    env = dict(frame.f_globals)
    env.update(frame.f_locals)
    steps = explain(stmt, env)
    if not steps:
        if seen == 0:
            state.hopeless.add(line)
        return

    for payload in steps:
        # no state of its own: the frontend draws the parent's frames and heap
        # and lays this panel over the top
        logger.trace.append(dict(event="explain", parent=parent_index,
                                 line=line, stdout=parent.get("stdout", ""),
                                 explain=payload))
        state.total += 1
