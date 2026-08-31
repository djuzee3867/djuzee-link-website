"""Structured snapshots for numpy / pandas values, plus the patches that make
pg_logger tolerate them.

pg_encoder turns anything with a custom __str__ into ['INSTANCE_PPRINT', cls, text]
-- one opaque string. You cannot colour a single cell of a string, so arrays and
frames get their own encoding here: a grid of values the frontend can draw, with
an optional parallel boolean mask for highlighting.

Everything here is loaded into Pyodide after pg_logger and patches it from the
outside; the vendored Python Tutor sources stay untouched.
"""

import os
import types

try:
    import numpy as _np
except ImportError:
    _np = None

try:
    import pandas as _pd
except ImportError:
    _pd = None

MAX_ROWS = 20        # rows kept (second-to-last axis)
MAX_COLS = 20        # columns kept (last axis)
MAX_PLANES = 3       # 2-D slices kept of a 3-D array
MAX_REPR = 160

_BUILTIN_OPEN = open

# packages the user may import once we have loaded them; sub-modules count too,
# so `import numpy.linalg` has to be matched on the root name
EXTRA_IMPORT_ROOTS = ("numpy", "pandas")

# pandas' own dependencies. Allowed so that reaching for one by hand is not a
# dead end, but left out of the list an ImportError offers -- nobody sets out to
# "import six".
QUIET_IMPORT_ROOTS = ("dateutil", "pytz", "six")

# The stdlib the sandbox hands over. pg_logger shipped with fifteen names on it,
# which left `from dataclasses import dataclass` and `import typing` raising
# ImportError for no reason we share: this runs in the browser, so there is no
# server to protect. What stays out is what would break the visualization rather
# than teach anything -- sys.settrace would unhook the tracer mid-run, threading
# and inspect walk frames the tracer owns, and os/socket/subprocess cannot do
# anything in Pyodide except fail in confusing ways.
STDLIB_IMPORT_ROOTS = (
    "abc", "array", "base64", "binascii", "bisect", "calendar", "cmath",
    "codecs", "collections", "colorsys", "contextlib", "copy", "csv",
    "dataclasses", "datetime", "decimal", "difflib", "enum", "fnmatch",
    "fractions", "functools", "graphlib", "hashlib", "heapq", "html", "io",
    "itertools", "json", "keyword", "math", "numbers", "operator", "pprint",
    "random", "re", "reprlib", "statistics", "string", "struct", "textwrap",
    "time", "types", "typing", "unicodedata", "uuid", "zlib",
)

MAX_LIB_ROWS = 100   # rows kept when unpacking a library container

# Bookkeeping the interpreter and the decorators write onto a class. pg_encoder
# hides the first seven already; @dataclass and ABC add the rest, and each one
# drags its own card onto the heap -- Field objects, _MISSING_TYPE, _abc_data
# and a `class int` that came from nothing but the x: int annotation.
HIDDEN_CLASS_ATTRS = frozenset((
    "__doc__", "__module__", "__return__", "__dict__", "__locals__",
    "__weakref__", "__qualname__",
    "__annotations__", "__dataclass_fields__", "__dataclass_params__",
    "__match_args__", "__slots__", "__orig_bases__", "__parameters__",
    "__abstractmethods__", "_abc_impl", "__firstlineno__",
    "__static_attributes__", "__type_params__",
    # EnumType writes these onto the class the user wrote, and each one is
    # another card: the name list, both member maps, a bare `class object`
    "_generate_next_value_", "_member_map_", "_member_names_",
    "_member_type_", "_new_member_", "_unhashable_values_", "_use_args_",
    "_value2member_map_", "_value_repr_", "_sort_order_", "_numeric_repr_",
    "_add_alias_", "_add_value_alias_",
))


# --------------------------------------------------------------- single cells

def _short_repr(value):
    try:
        text = repr(value)
    except Exception as exc:
        return "<repr failed: %s>" % type(exc).__name__
    return text[:MAX_REPR] + "…" if len(text) > MAX_REPR else text


def _cell(value):
    """One cell -> something json.dumps accepts.

    Every flavour of NA (None, NaN, NaT, pd.NA) collapses to None; the frontend
    draws that as a dimmed NaN so it never reads as a real 0.
    """
    if value is None:
        return None
    if _np is not None and isinstance(value, _np.generic):
        try:
            value = value.item()
        except Exception:
            return _short_repr(value)
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value:
            return None
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        return value
    if isinstance(value, str):
        return value
    if _pd is not None:
        try:
            if _pd.isna(value):
                return None
        except (TypeError, ValueError):
            pass
    return _short_repr(value)


def _walk(obj):
    if isinstance(obj, list):
        return [_walk(x) for x in obj]
    return _cell(obj)


def _walk_bool(obj):
    if isinstance(obj, list):
        return [_walk_bool(x) for x in obj]
    return bool(obj)


def _label(value):
    if isinstance(value, tuple):
        return " / ".join(_label(v) for v in value)
    cell = _cell(value)
    return "NaN" if cell is None else str(cell)


# --------------------------------------------------------------------- numpy

def _snap_ndarray(arr, highlight=None):
    info = {
        "kind": "ndarray",
        "dtype": str(arr.dtype),
        "shape": [int(n) for n in arr.shape],
        "ndim": int(arr.ndim),
        "size": int(arr.size),
        "is_view": arr.base is not None,
    }
    if arr.ndim == 0:
        info.update(data=_cell(arr[()]), shown=[], truncated=False)
        return info
    if arr.ndim > 3:
        # past 3-D there is no honest flat picture; show the shape and stop
        info.update(data=None, shown=[], truncated=True)
        return info

    limits = []
    for axis in range(arr.ndim):
        if axis == arr.ndim - 1:
            limits.append(MAX_COLS)
        elif axis == arr.ndim - 2:
            limits.append(MAX_ROWS)
        else:
            limits.append(MAX_PLANES)

    cut = tuple(slice(0, min(n, lim)) for n, lim in zip(arr.shape, limits))
    window = arr[cut]
    info["shown"] = [int(n) for n in window.shape]
    info["truncated"] = info["shown"] != info["shape"]
    info["data"] = _walk(window.tolist())
    if highlight is not None:
        info["highlight"] = _walk_bool(_np.asarray(highlight)[cut].tolist())
    return info


# -------------------------------------------------------------------- pandas

def _snap_dataframe(df, highlight=None):
    window = df.iloc[:MAX_ROWS, :MAX_COLS]
    rows, cols = window.shape
    info = {
        "kind": "DataFrame",
        "shape": [int(df.shape[0]), int(df.shape[1])],
        "shown": [int(rows), int(cols)],
        "truncated": tuple(window.shape) != tuple(df.shape),
        "columns": [_label(c) for c in window.columns],
        "index": [_label(i) for i in window.index],
        "index_name": None if df.index.name is None else _label(df.index.name),
        "dtypes": [str(t) for t in window.dtypes],
        "data": [[_cell(window.iat[r, c]) for c in range(cols)] for r in range(rows)],
    }
    if highlight is not None:
        info["highlight"] = _walk_bool(
            _np.asarray(highlight)[:MAX_ROWS, :MAX_COLS].tolist())
    return info


def _snap_series(s, highlight=None):
    window = s.iloc[:MAX_ROWS]
    info = {
        "kind": "Series",
        "dtype": str(s.dtype),
        "shape": [int(s.shape[0])],
        "shown": [int(window.shape[0])],
        "truncated": window.shape[0] != s.shape[0],
        "name": None if s.name is None else _label(s.name),
        "index": [_label(i) for i in window.index],
        "index_name": None if s.index.name is None else _label(s.index.name),
        "data": [_cell(v) for v in window.tolist()],
    }
    if highlight is not None:
        # a Series grid is one column wide, so the frontend wants [[flag], ...]
        flags = _walk_bool(_np.asarray(highlight)[:MAX_ROWS].tolist())
        info["highlight"] = [[flag] for flag in flags]
    return info


# ----------------------------------------------------------------- dispatcher

def snap(value, highlight=None):
    """A numpy/pandas value -> grid dict, or None if this is not our business."""
    if _np is not None:
        if isinstance(value, _np.ndarray):
            return _snap_ndarray(value, highlight)
        if isinstance(value, _np.generic):
            return {"kind": "scalar", "py_type": type(value).__name__,
                    "dtype": str(value.dtype), "data": _cell(value)}
    if _pd is not None:
        if isinstance(value, _pd.DataFrame):
            return _snap_dataframe(value, highlight)
        if isinstance(value, _pd.Series):
            return _snap_series(value, highlight)
    return None


def _foreign(value):
    """Anything else that lives inside numpy/pandas.

    pg_encoder would walk such an object attribute by attribute; a GroupBy or an
    Index drags in enough internals to bury the visualization, so they get one
    compact card instead.
    """
    module = getattr(type(value), "__module__", "") or ""
    if module.split(".")[0] not in ("numpy", "pandas"):
        return None
    return {"kind": "opaque", "py_type": type(value).__name__,
            "repr": _short_repr(value)}


def _library_class(dat):
    """A class the user did not write, as one line instead of two dozen cards.

    pg_encoder walks a class attribute by attribute, so `from collections import
    Counter` alone put the class plus every one of its twenty-odd methods on the
    heap, and none of it is what the reader is looking at.
    """
    if not isinstance(dat, type):
        return None
    module = getattr(dat, "__module__", "") or ""
    if module in ("__main__", ""):
        return None
    return ["LIBCLASS", getattr(dat, "__name__", None) or str(dat), module]


def _defers_to_str(dat):
    """pg_encoder draws anything with a real __str__ as one pprint card already."""
    return type(dat).__str__ is not object.__str__


def _container_payload(dat):
    """Rows for a subclass of a builtin container.

    Counter, defaultdict and OrderedDict keep what they hold in the base type
    rather than in __dict__, so pg_encoder finds nothing to show and the card
    reads "Counter instance -- empty" however full it is.
    """
    if isinstance(dat, type) or _defers_to_str(dat):
        return None
    if type(dat) in (dict, list, tuple, set, frozenset):
        return None      # handled by pg_encoder before it ever gets here
    if getattr(dat, "__dict__", None):
        return None      # a real attribute bag; let pg_encoder show that
    if isinstance(dat, dict):
        return list(dat.items())[:MAX_LIB_ROWS]
    if isinstance(dat, (list, tuple, set, frozenset)):
        return list(enumerate(list(dat)[:MAX_LIB_ROWS]))
    return None


def _library_repr(dat):
    """Last resort for a library object with nothing structured left to unpack.

    A deque holds nothing in __dict__ and is not a list subclass either, so it
    would come out empty; repr() at least says what is in it.
    """
    if isinstance(dat, type) or _defers_to_str(dat):
        return None
    module = getattr(type(dat), "__module__", "") or ""
    if module.split(".")[0] in ("__main__", ""):
        return None      # the user's own class, empty is the honest answer
    if getattr(dat, "__dict__", None):
        return None
    if type(dat).__repr__ is object.__repr__:
        return None
    return _short_repr(dat)


# ------------------------------------------------------------------- patching

def install(pg_encoder, pg_logger):
    """Teach the vendored tracer about numpy and pandas."""
    _patch_encoder(pg_encoder)
    _patch_imports(pg_logger)
    _patch_open(pg_logger)
    _patch_dispatch(pg_logger)


def _patch_encoder(pg_encoder):
    original_encode = pg_encoder.ObjectEncoder.encode
    original_instance = pg_encoder.ObjectEncoder.encode_class_or_instance

    def encode(self, dat, get_parent):
        # np.float64 subclasses float, but pg_encoder tests `type(dat) in
        # PRIMITIVE_TYPES`, so without this every element read out of an array
        # became its own heap card labelled "float64 instance"
        if _np is not None and isinstance(dat, _np.generic):
            try:
                item = dat.item()
            except Exception:
                item = dat
            if type(item) in pg_encoder.PRIMITIVE_TYPES:
                return pg_encoder.encode_primitive(item)
        return original_encode(self, dat, get_parent)

    def encode_class_or_instance(self, dat, new_obj):
        # pg_encoder has a module branch, but is_instance() claims modules first
        # and they end up as an "INSTANCE module" card with no name on it
        if isinstance(dat, types.ModuleType):
            new_obj.extend(["module", getattr(dat, "__name__", "module")])
            return
        grid = snap(dat)
        if grid is None:
            grid = _foreign(dat)
        if grid is not None:
            new_obj.extend(["VIZ", grid])
            return
        library = _library_class(dat)
        if library is not None:
            new_obj.extend(library)
            return
        rows = _container_payload(dat)
        if rows is not None:
            new_obj.extend(["INSTANCE", type(dat).__name__])
            for key, value in rows:
                new_obj.append([self.encode(key, None), self.encode(value, None)])
            return
        text = _library_repr(dat)
        if text is not None:
            new_obj.extend(["INSTANCE_PPRINT", type(dat).__name__, text])
            return
        # the user's own class: same shape pg_encoder produces, but the walk
        # has to skip the machinery rather than encode it and hide the row,
        # or every Field object is on the heap with nothing pointing at it
        if isinstance(dat, type):
            bases = [e.__name__ for e in dat.__bases__ if e is not object]
            new_obj.extend(["CLASS", pg_encoder.get_name(dat), bases])
            for attr in sorted(e for e in dat.__dict__
                               if e not in HIDDEN_CLASS_ATTRS):
                new_obj.append([self.encode(attr, None),
                                self.encode(dat.__dict__[attr], None)])
            return
        return original_instance(self, dat, new_obj)

    pg_encoder.ObjectEncoder.encode = encode
    pg_encoder.ObjectEncoder.encode_class_or_instance = encode_class_or_instance


def _patch_imports(pg_logger):
    """Widen the import whitelist.

    __restricted_import__ matches args[0] exactly, so `import numpy.linalg`
    (args[0] == "numpy.linalg") would be refused; match the root instead. It
    also strips os/sys/posix/gc off whatever it imports, and that is a lasting
    edit to the real module object -- deleting `sys` off `calendar` breaks
    calendar for the rest of the session -- so anything we vouch for goes
    straight to the builtin import.
    """
    offered = EXTRA_IMPORT_ROOTS + STDLIB_IMPORT_ROOTS
    allowed = frozenset(offered + QUIET_IMPORT_ROOTS)
    original = pg_logger.__restricted_import__

    def restricted_import(*args):
        names = [e for e in args if type(e) is str]
        name = names[0] if names else ""
        if name.split(".")[0] in allowed:
            return pg_logger.BUILTIN_IMPORT(*args)
        try:
            return original(*args)
        except ImportError:
            raise ImportError(
                "%s is not available here -- this runs inside your browser. "
                "You can import: %s" % (name, ", ".join(sorted(offered)))
            )

    pg_logger.__restricted_import__ = restricted_import


def _patch_open(pg_logger):
    """Hand open() back, so a file dropped on the page can be read.

    Python Tutor banned it outright and pointed at io.StringIO instead, which
    was the right call when the file being opened would have been on their
    server. Here the filesystem is a few kilobytes of MEMFS inside the tab,
    thrown away on reload, holding nothing but what the reader put there.

    pandas never needed this -- read_csv calls open out of its own module, not
    the builtins the tracer hands the user -- so this is for `open(...)` and the
    csv module written by hand.
    """
    def open_wrapper(*args, **kwargs):
        try:
            return _BUILTIN_OPEN(*args, **kwargs)
        except FileNotFoundError:
            raise FileNotFoundError(
                "there is no file called %r here. Drop one on the page, "
                "or use the + button above the editor. Loaded now: %s"
                % (args[0] if args else "?", _loaded_files())
            ) from None

    pg_logger.open_wrapper = open_wrapper


def _loaded_files():
    """What the reader can actually open, for the message above."""
    try:
        names = sorted(n for n in os.listdir(".") if os.path.isfile(n))
    except OSError:
        names = []
    return ", ".join(names) if names else "nothing"


def _patch_dispatch(pg_logger):
    """Stop tracing lines inside library code.

    bdb hands every frame a line-trace function, so without this the tracer fires
    on each of the thousands of pandas internal lines behind one groupby, checks
    the filename and throws the result away. Returning None from dispatch_call
    switches tracing off for that whole subtree instead. A user callback invoked
    by a library (df.apply(f)) is unaffected: its frame is still "<string>", and
    the global trace function is called for it either way.
    """
    original = pg_logger.PGLogger.dispatch_call

    def dispatch_call(self, frame, arg):
        if self.botframe is not None and frame.f_code.co_filename != "<string>":
            return None
        return original(self, frame, arg)

    pg_logger.PGLogger.dispatch_call = dispatch_call
