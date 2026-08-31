"use client";

/* Renders one step of a Python Tutor trace: frames on the left, heap objects
   on the right, and our own SVG connectors between them. Replaces the
   jsPlumb/jQuery rendering that pg_logger's frontend would normally do.

   numpy arrays and pandas frames arrive as ['VIZ', grid] instead of a string of
   repr text (see public/pyviz/viz_snap.py) so they can be drawn cell by cell,
   which is what makes the two kinds of colouring here possible:
     .chg  a cell whose value differs from the previous step
     .sel  a cell an explainer picked out, e.g. the ones a slice selects */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./traceviz.css";

const isRef = (v) => Array.isArray(v) && v[0] === "REF";
const isSpecialFloat = (v) => Array.isArray(v) && v[0] === "SPECIAL_FLOAT";
const isViz = (v) => Array.isArray(v) && v[0] === "VIZ";

function primitiveText(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return `"${v}"`;
  if (isSpecialFloat(v)) return v[1];
  return String(v);
}

/* ---------------------------------------------------------------- grids */

function fmtNumber(v) {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  if (abs >= 1e7 || (v !== 0 && abs < 1e-4)) return v.toExponential(3);
  return String(Math.round(v * 1e4) / 1e4);
}

/* a grid cell is already JSON-safe: null stands for every flavour of NA */
function cellText(v) {
  if (v === null || v === undefined) return "NaN";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return fmtNumber(v);
  return String(v);
}

function cellClass(v) {
  if (v === null || v === undefined) return "na";
  if (typeof v === "number" || typeof v === "boolean") return "";
  return "text";
}

const range = (n) => Array.from({ length: n }, (_, i) => i);

/* Compares one encoded value against another. Anything absent stringifies to
   `undefined`, which never equals a real value, so a slot or key that did not
   exist a step ago reads as changed. */
const stableKey = (v) => JSON.stringify(v);

/* Only diff two snapshots that still describe the same table. Without this a
   reshape or a new column repaints every cell as changed, which says nothing. */
function sameLayout(now, before) {
  if (!before || now.kind !== before.kind) return false;
  if (JSON.stringify(now.shown) !== JSON.stringify(before.shown)) return false;
  if (now.kind === "DataFrame") {
    return JSON.stringify(now.columns) === JSON.stringify(before.columns)
      && JSON.stringify(now.index) === JSON.stringify(before.index);
  }
  if (now.kind === "Series") {
    return JSON.stringify(now.index) === JSON.stringify(before.index);
  }
  return true;
}

function Grid({ rows, prevRows, highlight, rowHeads, colHeads, dtypes, corner }) {
  const width = rows.length ? rows[0].length : 0;
  return (
    <table className="tv-grid">
      {colHeads && (
        <thead>
          <tr>
            {rowHeads && <th className="tv-corner">{corner || ""}</th>}
            {colHeads.map((label, i) => (
              <th className="tv-colhead" key={i}>{label}</th>
            ))}
          </tr>
          {dtypes && (
            <tr className="tv-dtype-row">
              {rowHeads && <th className="tv-corner" />}
              {dtypes.map((t, i) => <th key={i}>{t}</th>)}
            </tr>
          )}
        </thead>
      )}
      <tbody>
        {rows.map((cells, r) => (
          <tr key={r}>
            {rowHeads && <th className="tv-rowhead">{rowHeads[r]}</th>}
            {range(width).map((c) => {
              const value = cells[c];
              const before = prevRows && prevRows[r] ? prevRows[r][c] : undefined;
              const changed = prevRows && before !== undefined && before !== value;
              const picked = Boolean(highlight && highlight[r] && highlight[r][c]);
              return (
                <td
                  key={c}
                  className={[cellClass(value), changed ? "chg" : "", picked ? "sel" : ""]
                    .filter(Boolean).join(" ")}
                >
                  {cellText(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TruncNote({ snap }) {
  if (!snap.truncated) return null;
  const full = snap.shape.join(" × ");
  const shown = snap.shown.length ? snap.shown.join(" × ") : "nothing";
  return <div className="tv-trunc">showing {shown} of {full}</div>;
}

/* one ['VIZ', grid] payload -> a table (or a stack of them for 3-D) */
function VizBody({ snap, prev }) {
  const before = sameLayout(snap, prev) ? prev : null;

  if (snap.kind === "scalar" || snap.kind === "opaque") {
    const text = snap.kind === "scalar" ? cellText(snap.data) : snap.repr;
    return <div className={`tv-text ${snap.kind === "opaque" ? "mono" : ""}`}>{text}</div>;
  }

  if (snap.kind === "ndarray") {
    if (snap.data === null || snap.data === undefined) {
      return <div className="tv-text">{snap.ndim}-D array — too many axes to draw</div>;
    }
    if (snap.ndim === 0) {
      return <div className="tv-text mono">{cellText(snap.data)}</div>;
    }
    if (snap.ndim === 1) {
      return (
        <div className="tv-gridwrap">
          <Grid
            rows={[snap.data]}
            prevRows={before ? [before.data] : null}
            highlight={snap.highlight ? [snap.highlight] : null}
            colHeads={range(snap.shown[0])}
          />
          <TruncNote snap={snap} />
        </div>
      );
    }
    if (snap.ndim === 2) {
      return (
        <div className="tv-gridwrap">
          <Grid
            rows={snap.data}
            prevRows={before ? before.data : null}
            highlight={snap.highlight}
            rowHeads={range(snap.shown[0])}
            colHeads={range(snap.shown[1])}
          />
          <TruncNote snap={snap} />
        </div>
      );
    }
    return (
      <div className="tv-gridwrap">
        {snap.data.map((plane, i) => (
          <div className="tv-plane" key={i}>
            <div className="tv-plane-label">[{i}]</div>
            <Grid
              rows={plane}
              prevRows={before && before.data ? before.data[i] : null}
              highlight={snap.highlight ? snap.highlight[i] : null}
              rowHeads={range(snap.shown[1])}
              colHeads={range(snap.shown[2])}
            />
          </div>
        ))}
        <TruncNote snap={snap} />
      </div>
    );
  }

  if (snap.kind === "DataFrame") {
    return (
      <div className="tv-gridwrap">
        <Grid
          rows={snap.data}
          prevRows={before ? before.data : null}
          highlight={snap.highlight}
          rowHeads={snap.index}
          colHeads={snap.columns}
          dtypes={snap.dtypes}
          corner={snap.index_name || ""}
        />
        <TruncNote snap={snap} />
      </div>
    );
  }

  if (snap.kind === "Series") {
    return (
      <div className="tv-gridwrap">
        <Grid
          rows={snap.data.map((v) => [v])}
          prevRows={before ? before.data.map((v) => [v]) : null}
          highlight={snap.highlight}
          rowHeads={snap.index}
          colHeads={[snap.name === null ? "values" : snap.name]}
          dtypes={[snap.dtype]}
          corner={snap.index_name || ""}
        />
        <TruncNote snap={snap} />
      </div>
    );
  }

  return <div className="tv-text mono">{JSON.stringify(snap)}</div>;
}

function vizHead(snap) {
  switch (snap.kind) {
    case "ndarray":
      return { label: "ndarray", chips: [snap.shape.join(" × ") || "0-D", snap.dtype] };
    case "DataFrame": {
      const [r, c] = snap.shape;
      return {
        label: "DataFrame",
        chips: [`${r} ${r === 1 ? "row" : "rows"} × ${c} ${c === 1 ? "col" : "cols"}`],
      };
    }
    case "Series": {
      const n = snap.shape[0];
      return { label: "Series", chips: [`${n} ${n === 1 ? "value" : "values"}`, snap.dtype] };
    }
    case "scalar":
      return { label: snap.py_type, chips: [snap.dtype].filter(Boolean) };
    default:
      return { label: snap.py_type || snap.kind, chips: [] };
  }
}

/* ------------------------------------------------- python-tutor value shapes */

function describe(obj) {
  if (!Array.isArray(obj)) return { kind: "raw", label: "value", text: String(obj) };
  const [tag, ...rest] = obj;
  switch (tag) {
    case "VIZ": {
      const head = vizHead(rest[0]);
      return { kind: "viz", label: head.label, chips: head.chips, snap: rest[0] };
    }
    case "LIST":
    case "TUPLE":
    case "SET":
      return {
        kind: "sequence",
        label: tag.toLowerCase(),
        chip: `${rest.length} ${rest.length === 1 ? "item" : "items"}`,
        items: rest,
        indexed: tag !== "SET",
      };
    case "DICT":
      return {
        kind: "pairs",
        label: "dict",
        chip: `${rest.length} ${rest.length === 1 ? "key" : "keys"}`,
        pairs: rest,
      };
    case "INSTANCE":
      return { kind: "pairs", label: `${rest[0]} instance`, pairs: rest.slice(1) };
    case "INSTANCE_PPRINT":
      return { kind: "text", label: `${rest[0]} instance`, text: String(rest[1]), mono: true };
    case "CLASS":
      return {
        kind: "pairs",
        label: `class ${rest[0]}`,
        chip: rest[1] && rest[1].length ? `extends ${rest[1].join(", ")}` : null,
        pairs: rest.slice(2),
      };
    case "FUNCTION":
      return { kind: "text", label: "function", text: rest[0], mono: true };
    /* a class out of a library: naming where it came from beats listing the
       twenty-odd methods pg_encoder would otherwise walk into */
    case "LIBCLASS":
      return { kind: "text", label: `class ${rest[0]}`, text: `from ${rest[1]}`, mono: true };
    case "module":
      return { kind: "text", label: "module", text: rest[0], mono: true };
    case "HEAP_PRIMITIVE":
      return { kind: "text", label: rest[0], text: primitiveText(rest[1]), mono: true };
    default:
      return { kind: "text", label: String(tag), text: String(rest[0] ?? ""), mono: true };
  }
}

/* every heap id a value (or nested value) points at */
function refsIn(value, out = []) {
  if (isRef(value)) out.push(String(value[1]));
  else if (Array.isArray(value)) value.forEach((v) => refsIn(v, out));
  return out;
}

/* Python Tutor cascades objects right and down: the object a frame points at
   sits at level 0, the one that object points at is level 1, and so on. Walking
   depth-first from the frames gives both that level and an order where an
   object's children follow it, so a chain reads straight down the column.
   The level follows the object graph rather than the shortest path from a
   frame, so a chain keeps its staircase even once a loop variable points
   part-way down it. */
function heapLayout(entry) {
  const heap = entry.heap || {};
  const level = {};
  const order = [];
  const placed = new Set();

  const visit = (id, depth) => {
    if (!heap[id] || placed.has(id)) return;
    placed.add(id);
    level[id] = depth;
    order.push(id);
    refsIn(heap[id]).forEach((child) => visit(child, depth + 1));
  };

  const roots = [];
  const collect = (v) => refsIn(v).forEach((id) => roots.push(id));
  (entry.ordered_globals || []).forEach((n) => collect((entry.globals || {})[n]));
  (entry.stack_to_render || []).forEach((f) =>
    (f.ordered_varnames || []).forEach((n) => collect((f.encoded_locals || {})[n]))
  );

  roots.forEach((id) => visit(id, 0));
  Object.keys(heap).forEach((id) => visit(id, 0)); // unreachable objects still get drawn

  return { level, order };
}

/* a reference renders as a dot the connector starts from */
function Value({ value, path }) {
  if (isRef(value)) {
    return <span className="tv-dot" data-from={path} data-to={value[1]} />;
  }
  const text = primitiveText(value);
  return (
    <span className={`tv-prim ${typeof value === "string" ? "is-str" : ""}`} title={text}>
      {text}
    </span>
  );
}

function ObjectCard({ id, obj, prevObj, isNew, level }) {
  const d = describe(obj);
  // A card that has only just appeared is entirely new, so diffing its
  // contents against nothing would just paint the whole thing.
  const before = isNew ? null : prevObj;
  const prevD = before ? describe(before) : null;
  const changed = Boolean(before) && stableKey(obj) !== stableKey(before);
  const prevSnap = isViz(before) ? before[1] : null;

  // a set has no meaningful index, so comparing slot i to slot i is nonsense
  const prevItems =
    prevD && prevD.kind === "sequence" && d.indexed && prevD.indexed ? prevD.items : null;
  const prevPairs =
    prevD && prevD.kind === "pairs"
      ? new Map(prevD.pairs.map(([k, v]) => [stableKey(k), stableKey(v)]))
      : null;

  return (
    <div
      className={`tv-card ${isNew ? "is-new" : ""}`}
      data-obj={id}
      // the step is a CSS variable so narrow screens can cascade more tightly
      style={level ? { marginLeft: `calc(var(--tv-step) * ${level})` } : undefined}
    >
      <div className="tv-card-head">
        <span className="tv-type">{d.label}</span>
        {d.chip && <span className="tv-chip">{d.chip}</span>}
        {d.chips && d.chips.map((c) => <span className="tv-chip" key={c}>{c}</span>)}
        {isNew && <span className="tv-chip new">new</span>}
        {changed && <span className="tv-chip changed">changed</span>}
      </div>

      {d.kind === "viz" && <VizBody snap={d.snap} prev={prevSnap} />}

      {d.kind === "sequence" && (
        <div className="tv-seq">
          {d.items.length === 0 && <span className="tv-empty-note">empty</span>}
          {d.items.map((item, i) => {
            // a slot that did not exist before counts as changed: on a list
            // being built up, the item that was just appended is the news
            const moved = prevItems && stableKey(item) !== stableKey(prevItems[i]);
            return (
              <div className={`tv-cell ${moved ? "chg" : ""}`} key={i}>
                {d.indexed && <span className="tv-idx">{i}</span>}
                <span className="tv-slot">
                  <Value value={item} path={`${id}:${i}`} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {d.kind === "pairs" && (
        <div className="tv-pairs">
          {d.pairs.length === 0 && <span className="tv-empty-note">empty</span>}
          {d.pairs.map(([k, v], i) => {
            const key = stableKey(k);
            const moved = prevPairs && prevPairs.get(key) !== stableKey(v);
            return (
              <div className={`tv-pair ${moved ? "chg" : ""}`} key={i}>
                <span className="tv-key">{typeof k === "string" ? k : primitiveText(k)}</span>
                <span className="tv-slot">
                  <Value value={v} path={`${id}:${i}`} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {d.kind === "text" && (
        <div className={`tv-text ${d.mono ? "mono" : ""}`}>{d.text}</div>
      )}
    </div>
  );
}

function Frame({ title, names, locals: vars, highlight, prevVars, keyPrefix }) {
  return (
    <div className={`tv-frame ${highlight ? "is-active" : ""}`}>
      <div className="tv-frame-head">{title}</div>
      {names.length === 0 ? (
        <div className="tv-frame-empty">no variables yet</div>
      ) : (
        names.map((name) => {
          const isNewName = Boolean(prevVars) && !(name in prevVars);
          // rebinding a name is a change; mutating the object it points at is
          // not — the reference stays the same and the object card says "changed"
          const rebound =
            Boolean(prevVars) && !isNewName && stableKey(prevVars[name]) !== stableKey(vars[name]);
          return (
            <div className={`tv-var ${rebound ? "chg" : ""}`} key={name}>
              <span className={`tv-var-name ${isNewName ? "is-new" : ""}`}>
                {name === "__return__" ? "Return value" : name}
              </span>
              <span className="tv-slot">
                <Value value={vars[name]} path={`${keyPrefix}:${name}`} />
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

/* The panel a sub-step lays over the top of the normal picture. It has no state
   of its own — the frames and objects below still belong to the parent step. */
function ExplainPanel({ explain }) {
  return (
    <div className="tv-explain">
      <div className="tv-explain-head">
        <span className="tv-explain-op">{explain.op}</span>
        <span className="tv-explain-title">{explain.title}</span>
      </div>
      <div className="tv-explain-boxes">
        {(explain.boxes || []).map((b, i) => (
          <div className="tv-explain-box" key={i}>
            <div className="tv-explain-label">{b.label}</div>
            {b.snap ? <VizBody snap={b.snap} prev={null} /> : null}
            {b.note && <div className="tv-explain-note">{b.note}</div>}
          </div>
        ))}
      </div>
      {explain.note && <div className="tv-explain-note wide">{explain.note}</div>}
    </div>
  );
}

export default function TraceViz({ entry, prev, explain }) {
  const wrapRef = useRef(null);
  const [paths, setPaths] = useState([]);

  // what the previous step held, so cards, cells and frame rows can each say
  // what moved. Null when there is no previous step: nothing to compare against.
  const prevHeap = prev ? prev.heap || {} : {};
  const prevHeapIds = new Set(prev ? Object.keys(prevHeap) : []);
  const prevGlobalVars = prev ? prev.globals || {} : null;
  const prevLocalsByFrame = new Map(
    (prev ? prev.stack_to_render || [] : []).map((f) => [f.frame_id, f.encoded_locals || {}])
  );

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      setPaths([]);
      return;
    }
    const base = wrap.getBoundingClientRect();
    const next = [];
    wrap.querySelectorAll(".tv-dot[data-to]").forEach((dot) => {
      const target = wrap.querySelector(`[data-obj="${CSS.escape(dot.dataset.to)}"]`);
      if (!target) return;
      const s = dot.getBoundingClientRect();
      const t = target.getBoundingClientRect();

      // A dot inside an object card leaves downwards. Leaving to the right
      // would cut through its own card's edge every single time, which is what
      // made a linked list look like it had been slashed through.
      const inside = dot.closest(".tv-card") !== null;
      const x1 = inside
        ? s.left + s.width / 2 - base.left + wrap.scrollLeft
        : s.right - base.left + wrap.scrollLeft;
      const y1 = inside
        ? s.bottom - base.top + wrap.scrollTop
        : s.top + s.height / 2 - base.top + wrap.scrollTop;

      // every arrow arrives horizontally at the left edge, level with the head
      const x2 = t.left - base.left + wrap.scrollLeft - 9;
      const y2 = t.top - base.top + wrap.scrollTop + Math.min(19, t.height / 2);

      // Handles grow with the distance instead of being capped. A capped handle
      // over a long span flattens the curve into a diagonal that cuts across
      // everything between the two cards; letting it grow keeps the line
      // leaving and arriving flat, so it reads as one sweep around the gap.
      const reach = Math.max(
        28,
        Math.abs(x2 - x1) * 0.45,
        Math.abs(y2 - y1) * 0.22
      );

      next.push({
        key: `${dot.dataset.from}->${dot.dataset.to}`,
        d: inside
          ? `M ${x1} ${y1} C ${x1} ${y1 + reach}, ${x2 - reach} ${y2}, ${x2} ${y2}`
          : `M ${x1} ${y1} C ${x1 + reach} ${y1}, ${x2 - reach} ${y2}, ${x2} ${y2}`,
      });
    });
    setPaths(next);
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, entry, explain]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  if (!entry) return null;

  const heap = entry.heap || {};
  const { level: levels, order: heapIds } = heapLayout(entry);

  return (
    <div className="tv-scroll" ref={wrapRef}>
      {explain && <ExplainPanel explain={explain} />}

      <svg className="tv-links" aria-hidden="true">
        <defs>
          <marker
            id="tv-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" />
          </marker>
        </defs>
        {paths.map((p) => (
          <path key={p.key} d={p.d} markerEnd="url(#tv-arrow)" />
        ))}
      </svg>

      <div className="tv-panes">
        <div className="tv-col frames">
          <div className="tv-col-head">Frames</div>
          <Frame
            title="Global frame"
            names={entry.ordered_globals || []}
            locals={entry.globals || {}}
            prevVars={prevGlobalVars}
            keyPrefix="g"
            highlight={!(entry.stack_to_render || []).length}
          />
          {(entry.stack_to_render || []).map((f) => (
            <Frame
              key={f.unique_hash || f.frame_id}
              title={f.func_name}
              names={f.ordered_varnames || []}
              locals={f.encoded_locals || {}}
              prevVars={prevLocalsByFrame.get(f.frame_id) || null}
              keyPrefix={`f${f.frame_id}`}
              highlight={f.is_highlighted}
            />
          ))}
        </div>

        <div className="tv-col objects">
          <div className="tv-col-head">Objects</div>
          {heapIds.length === 0 ? (
            <div className="tv-none">nothing on the heap yet</div>
          ) : (
            heapIds.map((id) => (
              <ObjectCard
                key={id}
                id={id}
                obj={heap[id]}
                prevObj={prevHeap[id]}
                isNew={!prevHeapIds.has(id)}
                level={Math.min(levels[id], 4)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
