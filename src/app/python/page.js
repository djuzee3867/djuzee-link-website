"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES, DEFAULT_CODE } from "./examples";
import { highlightPython } from "./highlight";
import "./python.css";


const STORAGE_KEY = "py-visualizer-state";
const DEFAULT_EDITOR_WIDTH = 440;
const MIN_EDITOR_WIDTH = 320;
const MIN_EDITOR_HEIGHT = 300;
const EDITOR_PADDING_Y = 14; // must match .editor-highlight's bottom padding

/* ---------------------------------------------------------------
   Editor: a transparent textarea sitting on top of a highlight layer.
   The layer is also what the gutter measures, so line numbers stay
   aligned even when a line soft-wraps onto several rows.
   --------------------------------------------------------------- */
function EditorWithGutter({ code, setCode, editorWrap, editorFont, onRun, curLine, prevLine, errorLine }) {
  const taRef = useRef(null);
  const gutRef = useRef(null);
  const layerRef = useRef(null);
  const shellRef = useRef(null);
  const pendingSelRef = useRef(null);
  const [lineHeights, setLineHeights] = useState([]);

  const lines = useMemo(() => code.split("\n"), [code]);
  const highlighted = useMemo(() => highlightPython(code), [code]);
  const digits = String(lines.length).length;
  // 21px lane on the left for the arrows + 6px on the right, then the digits
  const gutterWidth = 27 + Math.max(2, digits) * Math.max(8, Math.round(editorFont * 0.62));

  // keep the gutter and the highlight layer scrolled with the textarea
  const syncScroll = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    if (gutRef.current) gutRef.current.scrollTop = ta.scrollTop;
    if (layerRef.current) {
      layerRef.current.scrollTop = ta.scrollTop;
      layerRef.current.scrollLeft = ta.scrollLeft;
    }
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.addEventListener("scroll", syncScroll, { passive: true });
    return () => ta.removeEventListener("scroll", syncScroll);
  }, [syncScroll]);

  // measure real (wrapped) height of every line off the highlight layer
  const measure = useCallback(() => {
    const ta = taRef.current;
    const layer = layerRef.current;
    const shell = shellRef.current;
    if (!ta || !layer) return;
    // match the textarea's content width exactly, scrollbar included
    layer.style.width = `${ta.clientWidth}px`;

    // grow the editor with the code instead of scrolling inside a fixed box
    const last = layer.lastElementChild;
    if (shell && last) {
      // + the horizontal scrollbar the textarea shows when wrapping is off
      const scrollbar = Math.max(0, ta.offsetHeight - ta.clientHeight);
      const contentHeight = last.offsetTop + last.offsetHeight + EDITOR_PADDING_Y + scrollbar;
      const px = `${Math.max(MIN_EDITOR_HEIGHT, Math.ceil(contentHeight) + 2)}px`;
      if (shell.style.height !== px) shell.style.height = px;
    }

    if (!editorWrap) {
      setLineHeights((prev) => (prev.length ? [] : prev));
      return;
    }
    const next = Array.from(layer.children, (el) => el.offsetHeight);
    setLineHeights((prev) =>
      prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next
    );
  }, [editorWrap]);

  useEffect(() => { measure(); }, [measure, code, editorFont]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (shellRef.current) ro.observe(shellRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // keep the line of interest in view while stepping (or when a run fails)
  const focusLine = errorLine || curLine;
  useEffect(() => {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer || !focusLine) return;
    const el = layer.children[focusLine - 1];
    if (!el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < ta.scrollTop + 8) ta.scrollTop = Math.max(0, top - 8);
    else if (bottom > ta.scrollTop + ta.clientHeight - 8) {
      ta.scrollTop = bottom - ta.clientHeight + 8;
    }
    // setting scrollTop does not reliably fire a scroll event, so sync by hand
    syncScroll();
  }, [focusLine, syncScroll]);

  // restore caret after a programmatic edit (tab / enter / backspace)
  useEffect(() => {
    const ta = taRef.current;
    const sel = pendingSelRef.current;
    if (!ta || !sel) return;
    pendingSelRef.current = null;
    ta.selectionStart = sel[0];
    ta.selectionEnd = sel[1];
  }, [code]);

  const applyEdit = (nextValue, selStart, selEnd) => {
    pendingSelRef.current = [selStart, selEnd];
    setCode(nextValue);
  };

  const handleKeyDown = (e) => {
    const ta = e.currentTarget;
    const { selectionStart: start, selectionEnd: end, value } = ta;

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const multiline = value.slice(start, end).includes("\n");

      if (!e.shiftKey && !multiline) {
        const next = `${value.slice(0, start)}    ${value.slice(end)}`;
        applyEdit(next, start + 4, start + 4);
        return;
      }

      const nlAfter = value.indexOf("\n", end);
      const lineEnd = nlAfter === -1 ? value.length : nlAfter;
      const block = value.slice(lineStart, lineEnd);
      const blockLines = block.split("\n");
      const newLines = e.shiftKey
        ? blockLines.map((l) => l.replace(/^ {1,4}/, ""))
        : blockLines.map((l) => (l.length ? `    ${l}` : l));
      const newBlock = newLines.join("\n");
      const firstDelta = newLines[0].length - blockLines[0].length;
      const totalDelta = newBlock.length - block.length;
      const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
      applyEdit(
        next,
        Math.max(lineStart, start + firstDelta),
        Math.max(lineStart, end + totalDelta)
      );
      return;
    }

    if (e.key === "Enter" && start === end) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineText = value.slice(lineStart, start);
      const indent = (lineText.match(/^[ \t]*/) || [""])[0];
      const extra = lineText.trimEnd().endsWith(":") ? "    " : "";
      if (!indent && !extra) return; // let the browser handle it
      e.preventDefault();
      const insert = `\n${indent}${extra}`;
      const next = value.slice(0, start) + insert + value.slice(end);
      applyEdit(next, start + insert.length, start + insert.length);
      return;
    }

    if (e.key === "Backspace" && start === end) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const before = value.slice(lineStart, start);
      if (before.length >= 4 && /^ +$/.test(before) && before.length % 4 === 0) {
        e.preventDefault();
        const next = value.slice(0, start - 4) + value.slice(start);
        applyEdit(next, start - 4, start - 4);
      }
    }
  };

  // an error outranks the stepper markers on the same line
  const lineState = (n) =>
    n === errorLine ? " is-error" : n === curLine ? " is-cur" : n === prevLine ? " is-prev" : "";

  return (
    <div className="editor-shell" ref={shellRef} style={{ fontSize: `${editorFont}px` }}>
      <div className="editor-gutter" ref={gutRef} style={{ width: `${gutterWidth}px` }} aria-hidden>
        {lines.map((_, i) => (
          <div
            key={i}
            className={`gut-line${lineState(i + 1)}`}
            style={lineHeights[i] ? { height: `${lineHeights[i]}px` } : undefined}
          >
            {i + 1}
          </div>
        ))}
      </div>
      {/* one flex item holding both layers, so their geometry is identical */}
      <div className="editor-code">
        <div className={`editor-highlight ${editorWrap ? "wrap" : ""}`} ref={layerRef} aria-hidden>
          {highlighted.map((html, i) => (
            <div
              key={i}
              className={`hl-line${lineState(i + 1)}`}
              dangerouslySetInnerHTML={{ __html: html || "&#8203;" }}
            />
          ))}
        </div>
        <textarea
          ref={taRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          className={`editor ${editorWrap ? "wrap" : ""}`}
          aria-label="Python code editor"
          placeholder="# Write Python here, then press Run (Ctrl+Enter)"
        />
      </div>
    </div>
  );
}

/* ---------------- asset loading helpers (module scope so the
   promise cache survives re-mounts) ---------------- */
const scriptPromises = new Map();
function loadScriptOnce(src) {
  if (scriptPromises.has(src)) return scriptPromises.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
  scriptPromises.set(src, p);
  p.catch(() => scriptPromises.delete(src));
  return p;
}
function loadCssOnce(href) {
  if (document.querySelector(`link[data-py-css="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.pyCss = href;
    l.onload = () => resolve();
    l.onerror = () => resolve(); // stylesheet is cosmetic, never block the run
    document.head.appendChild(l);
  });
}

export default function PythonVisualizerPage() {
  const [pyodide, setPyodide] = useState(null);
  const [loadingPyodide, setLoadingPyodide] = useState(true);
  const [pyodideFailed, setPyodideFailed] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const [tutorReady, setTutorReady] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);
  // lines the tracer is pointing at, mirrored from the visualizer into the editor
  const [execLines, setExecLines] = useState({ cur: null, prev: null });
  const [errorLine, setErrorLine] = useState(null);
  const [showContent, setShowContent] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editorWrap, setEditorWrap] = useState(false);
  const [editorFont, setEditorFont] = useState(14);
  const [editorWidth, setEditorWidth] = useState(DEFAULT_EDITOR_WIDTH);
  const [dragging, setDragging] = useState(false);

  const rawInputsRef = useRef([]);
  const vizResizeObserverRef = useRef(null);
  const vizHostRef = useRef(null);
  const vizPointerUpRef = useRef(null);
  const prefsLoadedRef = useRef(false);
  // mirrors of state read from callbacks that outlive their render
  // (the visualizer keeps our raw-input handler around after a run)
  const codeRef = useRef(code);
  const runningRef = useRef(false);
  useEffect(() => { codeRef.current = code; }, [code]);

  /* ---------- restore / persist preferences ---------- */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        if (typeof saved.code === "string" && saved.code.trim()) setCode(saved.code);
        if (typeof saved.font === "number") setEditorFont(saved.font);
        if (typeof saved.wrap === "boolean") setEditorWrap(saved.wrap);
        if (typeof saved.width === "number") setEditorWidth(saved.width);
      }
    } catch {}
    prefsLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!prefsLoadedRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ code, font: editorFont, wrap: editorWrap, width: editorWidth })
        );
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [code, editorFont, editorWrap, editorWidth]);

  /* ---------- load Pyodide ---------- */
  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 20);
    let cancelled = false;
    (async () => {
      try {
        await loadScriptOnce("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");
        const py = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
        });
        if (cancelled) return;
        setPyodide(py);
      } catch (e) {
        console.error(e);
        if (!cancelled) setPyodideFailed(true);
      } finally {
        if (!cancelled) setLoadingPyodide(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  function ripple(e) {
    const target = e.currentTarget;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.2;
    const x = (e.clientX ?? rect.width / 2) - rect.left;
    const y = (e.clientY ?? rect.height / 2) - rect.top;
    const span = document.createElement("span");
    span.className = "ripple";
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.left = `${x - size / 2}px`;
    span.style.top = `${y - size / 2}px`;
    target.appendChild(span);
    span.addEventListener("animationend", () => span.remove());
  }

  /* ---------- Python Tutor assets ---------- */
  const pgLoggerLoadedRef = useRef(false);
  const tutorAssetsLoadedRef = useRef(false);

  async function ensureTutorAssets() {
    if (tutorAssetsLoadedRef.current && window.ExecutionVisualizer) return;
    const base = "/pythontutor/v3";
    await loadCssOnce(`${base}/js/jquery-ui-1.11.4/jquery-ui.css`);
    await loadCssOnce(`${base}/css/jquery.qtip.css`);
    await loadCssOnce(`${base}/css/pytutor.css`);
    // order matters: these scripts depend on the previous globals
    await loadScriptOnce(`${base}/js/d3.v2.min.js`);
    await loadScriptOnce(`${base}/js/jquery-1.8.2.min.js`);
    await loadScriptOnce(`${base}/js/jquery.ba-bbq.min.js`);
    await loadScriptOnce(`${base}/js/jquery.ba-dotimeout.min.js`);
    await loadScriptOnce(`${base}/js/jquery.corner.js`);
    await loadScriptOnce(`${base}/js/jquery-ui-1.11.4/jquery-ui.min.js`);
    await loadScriptOnce(`${base}/js/jquery.jsPlumb-1.3.10-all-min.js`);
    await loadScriptOnce(`${base}/js/jquery.qtip.min.js`);
    await loadScriptOnce(`${base}/js/pytutor.js`);
    if (!window.ExecutionVisualizer) {
      throw new Error("Python Tutor assets failed to load");
    }
    tutorAssetsLoadedRef.current = true;
  }

  async function ensurePgLogger() {
    if (!pyodide || pgLoggerLoadedRef.current) return;
    const base = "/pythontutor/v3";
    const [encSrc, logSrc] = await Promise.all([
      fetch(`${base}/pg_encoder.py`).then((r) => r.text()),
      fetch(`${base}/pg_logger.py`).then((r) => r.text()),
    ]);
    pyodide.globals.set("___enc_src___", encSrc);
    pyodide.globals.set("___log_src___", logSrc);
    await pyodide.runPythonAsync(`
import sys, types
# stub optional custom modules used by pg_logger so imports don't fail
for _name in ('callback_module','ttt_module','html_module','htmlexample_module','matrix','htmlFrame'):
    if _name not in sys.modules:
        sys.modules[_name] = types.ModuleType(_name)

m_enc = types.ModuleType('pg_encoder')
exec(___enc_src___, m_enc.__dict__)
sys.modules['pg_encoder'] = m_enc

m_log = types.ModuleType('pg_logger')
exec(___log_src___, m_log.__dict__)
sys.modules['pg_logger'] = m_log
`);
    pyodide.globals.delete("___enc_src___");
    pyodide.globals.delete("___log_src___");
    pgLoggerLoadedRef.current = true;
  }

  /* ---------- visualizer lifecycle ---------- */
  const teardownViz = useCallback(() => {
    if (vizResizeObserverRef.current) {
      try { vizResizeObserverRef.current.disconnect(); } catch {}
      vizResizeObserverRef.current = null;
    }
    if (vizHostRef.current && vizPointerUpRef.current) {
      try { vizHostRef.current.removeEventListener("pointerup", vizPointerUpRef.current); } catch {}
    }
    vizHostRef.current = null;
    vizPointerUpRef.current = null;
    if (typeof window !== "undefined" && window.myVizResizeHandler) {
      window.removeEventListener("resize", window.myVizResizeHandler);
      delete window.myVizResizeHandler;
    }
    if (typeof window !== "undefined" && window.myVisualizer) {
      try { delete window.myVisualizer; } catch { window.myVisualizer = undefined; }
    }
    const host = typeof document !== "undefined" ? document.getElementById("opt-viz") : null;
    if (host) host.innerHTML = "";
  }, []);

  const redraw = useCallback(() => {
    // The stepper shares a table with the data view, so a wide heap stretches
    // it to thousands of pixels. Pin it to the visible width instead.
    const host = document.getElementById("opt-viz");
    const body = host && host.closest(".viz-body");
    const stepper = host && host.querySelector("#codeDisplayDiv");
    if (stepper && body) {
      const px = `${Math.max(320, body.clientWidth - 34)}px`;
      if (stepper.style.width !== px) stepper.style.width = px;
    }
    try { window.myVisualizer && window.myVisualizer.redrawConnectors(); } catch {}
  }, []);

  async function runWithTutor(resume = false, inputsOverride = null) {
    if (!pyodide || runningRef.current) return;
    const source = codeRef.current;
    runningRef.current = true;
    setRunning(true);
    setRunError("");
    setErrorLine(null);
    try {
      await ensureTutorAssets();
      await ensurePgLogger();

      const inputs = resume ? inputsOverride || rawInputsRef.current || [] : [];
      if (!resume) rawInputsRef.current = [];

      pyodide.globals.set("___code_str___", source);
      pyodide.globals.set("___raw_inputs___", JSON.stringify(inputs));
      const jsonStr = await pyodide.runPythonAsync(`
import json
import pg_logger
trace = pg_logger.exec_script_str_local(___code_str___, ___raw_inputs___, False, False, lambda cod, tr: tr)
json.dumps({'code': ___code_str___, 'trace': trace})
`);
      pyodide.globals.delete("___code_str___");
      pyodide.globals.delete("___raw_inputs___");

      const data = JSON.parse(jsonStr);
      const trace = Array.isArray(data.trace) ? data.trace : [];

      teardownViz();

      // errors that end the program are the last entry of the trace
      const last = trace[trace.length - 1];
      const fatal =
        last && ["exception", "uncaught_exception", "instruction_limit_reached"].includes(last.event)
          ? last
          : null;
      if (fatal) {
        // strip the internal "(<string>, line N)" that Python adds to syntax errors
        const msg = String(fatal.exception_msg || "Execution stopped")
          .replace(/\s*\(<string>,\s*line \d+\)/, "")
          .trim();
        setRunError(`${msg}${fatal.line ? ` (line ${fatal.line})` : ""}`);
        // mark the offending line in the editor — for a syntax error that is
        // the only feedback there is, since nothing ran
        if (fatal.line) setErrorLine(fatal.line);
      }

      // a syntax error (or anything that never ran) has no steps to draw —
      // showing the error alone beats crashing inside the visualizer
      const hasSteps = trace.some(
        (ev) => ev && ev.event !== "uncaught_exception" && ev.event !== "raw_input"
      );
      if (!hasSteps) {
        setTutorReady(false);
        setAwaitingInput(false);
        setExecLines({ cur: null, prev: null });
        if (!fatal) setRunError("No execution steps were produced. Check your code for syntax errors.");
        return;
      }

      // does the program want more input? (read it now: the visualizer pops
      // the trailing raw_input entry off the trace when it is constructed,
      // and renders its own prompt box at the last step)
      setAwaitingInput(Boolean(last && last.event === "raw_input"));

      const host = document.getElementById("opt-viz");
      if (!host) throw new Error("Visualization container is missing");

      const viz = new window.ExecutionVisualizer("opt-viz", { code: source, trace }, {
        startingInstruction: 0,
        // the code is shown once, in our own editor: Python Tutor keeps the
        // stepper and the data view, but draws no second copy of the code
        verticalStack: true,
        arrowLines: false,
        highlightLines: false,
        executeCodeWithRawInputFunc: (rawInputStr) => {
          const v = rawInputStr == null ? "" : String(rawInputStr);
          const next = [...(rawInputsRef.current || []), v];
          rawInputsRef.current = next;
          setAwaitingInput(false);
          runWithTutor(true, next);
        },
      });
      window.myVisualizer = viz;

      // mirror the stepper's position into the editor on every step
      const syncLines = (v) => {
        try {
          v.updateCurPrevLines();
          setExecLines({ cur: v.curLineNumber || null, prev: v.prevLineNumber || null });
        } catch {}
      };
      viz.add_pytutor_hook("end_updateOutput", (args) => {
        syncLines(args.myViz);
        return [false];
      });
      syncLines(viz);

      setTimeout(redraw, 0);

      window.myVizResizeHandler = redraw;
      window.addEventListener("resize", window.myVizResizeHandler);

      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(redraw);
        [
          host,
          host.closest(".viz-body"),
          host.querySelector("#dataViz"),
          host.querySelector("#pyOutputPane"),
          host.querySelector("#pyStdout"),
        ]
          .filter(Boolean)
          .forEach((el) => { try { ro.observe(el); } catch {} });
        vizResizeObserverRef.current = ro;
      }
      const onPointerUp = () => redraw();
      host.addEventListener("pointerup", onPointerUp);
      vizHostRef.current = host;
      vizPointerUpRef.current = onPointerUp;

      setTutorReady(true);
    } catch (e) {
      setRunError(e && e.message ? e.message : String(e));
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const reset = () => {
    setRunError("");
    setAwaitingInput(false);
    setTutorReady(false);
    setExecLines({ cur: null, prev: null });
    setErrorLine(null);
    rawInputsRef.current = [];
    teardownViz();
  };

  // the splitter changes the panel width without the observers noticing
  useEffect(() => { redraw(); }, [editorWidth, redraw]);

  // editing invalidates the trace, so drop the line markers
  useEffect(() => {
    setExecLines((p) => (p.cur || p.prev ? { cur: null, prev: null } : p));
    setErrorLine(null);
  }, [code]);

  useEffect(() => teardownViz, [teardownViz]);

  /* ---------- fullscreen ---------- */
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = expanded ? "hidden" : prev;
    const timers = [setTimeout(redraw, 0), setTimeout(redraw, 260)];
    return () => {
      document.body.style.overflow = prev;
      timers.forEach(clearTimeout);
    };
  }, [expanded, redraw]);

  /* ---------- keyboard: step / exit fullscreen ---------- */
  useEffect(() => {
    const isTyping = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKey = (e) => {
      if (e.key === "Escape" && expanded) {
        setExpanded(false);
        return;
      }
      if (isTyping(document.activeElement)) return;
      if (!window.myVisualizer) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        try { window.myVisualizer.stepBack(); } catch {}
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        try { window.myVisualizer.stepForward(); } catch {}
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  /* ---------- splitter ---------- */
  const startDrag = (e) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = editorWidth;
    const maxWidth = Math.max(MIN_EDITOR_WIDTH, window.innerWidth - 460);
    const onMove = (ev) => {
      const next = Math.min(maxWidth, Math.max(MIN_EDITOR_WIDTH, startWidth + ev.clientX - startX));
      setEditorWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      redraw();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const rootStyle = useMemo(
    () => ({ "--editor-panel-width": `${editorWidth}px` }),
    [editorWidth]
  );

  const canRun = Boolean(pyodide) && !loadingPyodide && !running;

  // plain render helper (not a component) so it is not remounted on every render
  const runButton = () => (
    <button
      className={`btn primary ${running ? "busy" : ""}`}
      onPointerDown={ripple}
      onClick={() => runWithTutor(false)}
      disabled={!canRun}
      title="Run (Ctrl+Enter)"
    >
      {running ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="spin"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
          Tracing
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          Run
        </>
      )}
    </button>
  );

  return (
    <div
      className={`py-root ${showContent ? "show" : ""} ${expanded ? "expanded" : ""} ${dragging ? "dragging" : ""}`}
      style={rootStyle}
    >
      <header className="py-header">
        <div className="py-header-inner">
          <div className="brand">
            <span className="brand-name">Python Visualizer</span>
          </div>
          <div className="header-hint">
            <span className="kbd-hints">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd> run
              <span className="hint-sep" />
              <kbd>&larr;</kbd><kbd>&rarr;</kbd> step
            </span>
            <span className="hint-sep" />
            <span className="line-legend">
              <span className="swatch prev" />just executed
              <span className="swatch cur" />next to execute
              <span className="swatch err" />error
            </span>
          </div>
          <nav className="py-nav">
            <a href="/" className="nav-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
              Home
            </a>
          </nav>
        </div>
      </header>

      <main className="py-main">
        <section className="panel editor-panel">
          <div className="panel-header">
            <span className="panel-title">Code Editor</span>
            <div className="status">
              {loadingPyodide ? (
                <span className="badge loading"><span className="status-dot" />Loading Python</span>
              ) : pyodide ? (
                <span className="badge ok"><span className="status-dot" />Ready</span>
              ) : (
                <span className="badge error"><span className="status-dot" />Failed to load</span>
              )}
            </div>
          </div>

          <div className="editor-wrap">
            <div className="editor-toolbar">
              <div className="tool-group">
                <label className="tool-label" htmlFor="example-select">Examples</label>
                <select
                  id="example-select"
                  className="tool-select"
                  value=""
                  onChange={(e) => {
                    const found = EXAMPLES.find((x) => x.id === e.target.value);
                    if (found) setCode(found.code);
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>Choose an example</option>
                  {EXAMPLES.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.label}</option>
                  ))}
                </select>
              </div>
              <div className="tool-group">
                <label className="tool-label" htmlFor="font-range">Font</label>
                <input
                  id="font-range"
                  type="range"
                  min={12}
                  max={20}
                  step={1}
                  value={editorFont}
                  onChange={(e) => setEditorFont(parseInt(e.target.value || "14", 10))}
                  className="tool-range"
                />
                <span className="tool-value">{editorFont}px</span>
              </div>
              <label className="tool-checkbox">
                <input type="checkbox" checked={editorWrap} onChange={(e) => setEditorWrap(e.target.checked)} />
                Wrap
              </label>
              <div className="tool-spacer" />
              <button className="mini-btn" onPointerDown={ripple} title="Copy code" onClick={async () => { try { await navigator.clipboard.writeText(code); } catch {} }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                Copy
              </button>
              <button className="mini-btn" onPointerDown={ripple} title="Paste from clipboard" onClick={async () => { try { const t = await navigator.clipboard.readText(); if (t) setCode(t); } catch {} }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></svg>
                Paste
              </button>
              <button className="mini-btn danger" onPointerDown={ripple} title="Clear editor" onClick={() => setCode("")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                Clear
              </button>
            </div>

            <EditorWithGutter
              code={code}
              setCode={setCode}
              editorWrap={editorWrap}
              editorFont={editorFont}
              onRun={() => runWithTutor(false)}
              curLine={execLines.cur}
              prevLine={execLines.prev}
              errorLine={errorLine}
            />
            <div className="editor-foot">
              <span>{code.split("\n").length === 1 ? "1 line" : `${code.split("\n").length} lines`}</span>
              <span>Tab indents, Shift+Tab outdents</span>
            </div>
          </div>

          <div className="controls">
            {runButton()}
            <button className="btn" onPointerDown={ripple} onClick={reset} disabled={running}>Reset</button>
            {awaitingInput && (
              <span className="waiting-input">Waiting for input in the trace panel</span>
            )}
          </div>

          {runError && (
            <div className="callout error">
              <div className="callout-title">Error</div>
              <div className="callout-body">{runError}</div>
            </div>
          )}
          {pyodideFailed && !runError && (
            <div className="callout error">
              <div className="callout-title">Error</div>
              <div className="callout-body">Could not load the Python runtime. Check your connection and reload the page.</div>
            </div>
          )}
        </section>

        <div
          className="splitter"
          onPointerDown={startDrag}
          onDoubleClick={() => setEditorWidth(DEFAULT_EDITOR_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize code editor"
          title="Drag to resize, double-click to reset"
        >
          <span className="splitter-grip" />
        </div>

        <section className="panel viz-panel">
          <div className="panel-header">
            <h2 className="panel-title">Execution Trace</h2>
            <div className="panel-actions">
              <span className={`meta ${tutorReady ? "ok" : ""}`}>
                <span className="meta-dot" />
                {running ? "Tracing" : tutorReady ? "Ready" : "Waiting"}
              </span>
              <button
                className="mini-btn"
                onPointerDown={ripple}
                onClick={toggleExpanded}
                title={expanded ? "Exit fullscreen (Esc)" : "Expand to fullscreen"}
              >
                {expanded ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    Exit fullscreen
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                    Fullscreen
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="viz-body">
            <div id="opt-viz" />
            {!tutorReady && (
              <div className="empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                <p>Write code and press Run to visualize execution</p>
                <span>Then use Forward / Back, or the arrow keys, to step through it</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
