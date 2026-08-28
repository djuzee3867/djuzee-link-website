"use client";

/* Renders one step of a Python Tutor trace: frames on the left, heap objects
   on the right, and our own SVG connectors between them. Replaces the
   jsPlumb/jQuery rendering that pg_logger's frontend would normally do. */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "./traceviz.css";

const isRef = (v) => Array.isArray(v) && v[0] === "REF";
const isSpecialFloat = (v) => Array.isArray(v) && v[0] === "SPECIAL_FLOAT";

function primitiveText(v) {
  if (v === null || v === undefined) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return `"${v}"`;
  if (isSpecialFloat(v)) return v[1];
  return String(v);
}

/* [tag, ...rest] -> a heading and a body shape the card can render */
function describe(obj) {
  if (!Array.isArray(obj)) return { kind: "raw", label: "value", text: String(obj) };
  const [tag, ...rest] = obj;
  switch (tag) {
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
      return { kind: "text", label: `${rest[0]} instance`, text: String(rest[1]) };
    case "CLASS":
      return {
        kind: "pairs",
        label: `class ${rest[0]}`,
        chip: rest[1] && rest[1].length ? `extends ${rest[1].join(", ")}` : null,
        pairs: rest.slice(2),
      };
    case "FUNCTION":
      return { kind: "text", label: "function", text: rest[0], mono: true };
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

function ObjectCard({ id, obj, isNew, level }) {
  const d = describe(obj);
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
        {isNew && <span className="tv-chip new">new</span>}
      </div>

      {d.kind === "sequence" && (
        <div className="tv-seq">
          {d.items.length === 0 && <span className="tv-empty-note">empty</span>}
          {d.items.map((item, i) => (
            <div className="tv-cell" key={i}>
              {d.indexed && <span className="tv-idx">{i}</span>}
              <span className="tv-slot">
                <Value value={item} path={`${id}:${i}`} />
              </span>
            </div>
          ))}
        </div>
      )}

      {d.kind === "pairs" && (
        <div className="tv-pairs">
          {d.pairs.length === 0 && <span className="tv-empty-note">empty</span>}
          {d.pairs.map(([k, v], i) => (
            <div className="tv-pair" key={i}>
              <span className="tv-key">{typeof k === "string" ? k : primitiveText(k)}</span>
              <span className="tv-slot">
                <Value value={v} path={`${id}:${i}`} />
              </span>
            </div>
          ))}
        </div>
      )}

      {d.kind === "text" && (
        <div className={`tv-text ${d.mono ? "mono" : ""}`}>{d.text}</div>
      )}
    </div>
  );
}

function Frame({ title, names, locals: vars, highlight, newNames, keyPrefix }) {
  return (
    <div className={`tv-frame ${highlight ? "is-active" : ""}`}>
      <div className="tv-frame-head">{title}</div>
      {names.length === 0 ? (
        <div className="tv-frame-empty">no variables yet</div>
      ) : (
        names.map((name) => (
          <div className="tv-var" key={name}>
            <span className={`tv-var-name ${newNames.has(name) ? "is-new" : ""}`}>
              {name === "__return__" ? "Return value" : name}
            </span>
            <span className="tv-slot">
              <Value value={vars[name]} path={`${keyPrefix}:${name}`} />
            </span>
          </div>
        ))
      )}
    </div>
  );
}

export default function TraceViz({ trace, step }) {
  const wrapRef = useRef(null);
  const [paths, setPaths] = useState([]);

  const entry = trace[step] || null;
  const prev = step > 0 ? trace[step - 1] : null;

  // objects and names that appeared at this step get a subtle highlight
  const prevHeapIds = new Set(prev ? Object.keys(prev.heap || {}) : []);
  const prevGlobals = new Set(prev ? prev.ordered_globals || [] : []);

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
      const x1 = s.right - base.left + wrap.scrollLeft;
      const y1 = s.top + s.height / 2 - base.top + wrap.scrollTop;
      const x2 = t.left - base.left + wrap.scrollLeft - 9;
      const y2 = t.top - base.top + wrap.scrollTop + Math.min(19, t.height / 2);
      const dx = x2 - x1;
      const dy = y2 - y1;
      let c1x;
      let c1y;
      let c2x;
      let c2y;
      if (dx > 24) {
        // card is off to the right: a shallow horizontal arc
        const k = Math.min(55, Math.max(18, dx * 0.55));
        c1x = x1 + k;
        c1y = y1;
        c2x = x2 - k;
        c2y = y2;
      } else {
        // card is level with or behind the dot (a chain pointing back down the
        // column): drop out of the dot and come in from the left rather than
        // looping backwards across everything in between
        const k = Math.min(48, Math.max(20, Math.abs(dy) * 0.35));
        c1x = x1 + 18;
        c1y = y1 + k;
        c2x = x2 - 28;
        c2y = y2 - k * 0.5;
      }
      next.push({
        key: `${dot.dataset.from}->${dot.dataset.to}`,
        d: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
      });
    });
    setPaths(next);
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, entry, step]);

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
    <div className="tv-panes" ref={wrapRef}>
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

      <div className="tv-col frames">
        <div className="tv-col-head">Frames</div>
        <Frame
          title="Global frame"
          names={entry.ordered_globals || []}
          locals={entry.globals || {}}
          newNames={new Set((entry.ordered_globals || []).filter((n) => !prevGlobals.has(n)))}
          keyPrefix="g"
          highlight={!(entry.stack_to_render || []).length}
        />
        {(entry.stack_to_render || []).map((f) => (
          <Frame
            key={f.unique_hash || f.frame_id}
            title={f.func_name}
            names={f.ordered_varnames || []}
            locals={f.encoded_locals || {}}
            newNames={new Set()}
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
              isNew={!prevHeapIds.has(id)}
              level={Math.min(levels[id], 4)}
            />
          ))
        )}
      </div>
    </div>
  );
}
