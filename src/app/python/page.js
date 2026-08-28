"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLES, DEFAULT_CODE } from "./examples";
import { highlightPython } from "./highlight";
import TraceViz from "./TraceViz";
import "./python.css";

const STORAGE_KEY = "py-visualizer-state";
const DEFAULT_CODE_WIDTH = 520;
const MIN_CODE_WIDTH = 320;

// typing an opener inserts the pair; typing the closer steps over it
const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
const CLOSERS = new Set([")", "]", "}", '"', "'"]);

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

  // measure the real (wrapped) height of every line off the highlight layer
  const measure = useCallback(() => {
    const ta = taRef.current;
    const layer = layerRef.current;
    if (!ta || !layer) return;
    layer.style.width = `${ta.clientWidth}px`;
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

    // brackets and quotes
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key;
      const closer = PAIRS[ch];
      const selected = value.slice(start, end);
      const nextChar = value[end] || "";
      const prevChar = value[start - 1] || "";

      if (selected && closer) {
        e.preventDefault();
        applyEdit(
          value.slice(0, start) + ch + selected + closer + value.slice(end),
          start + 1,
          end + 1
        );
        return;
      }

      if (!selected && CLOSERS.has(ch) && nextChar === ch) {
        e.preventDefault();
        ta.selectionStart = ta.selectionEnd = start + 1;
        return;
      }

      if (!selected && closer) {
        const isQuote = ch === '"' || ch === "'";
        // leave text alone when typing right before a word, and never turn an
        // apostrophe inside a word (don't) into a pair
        const glued = /[\w"']/.test(nextChar) || (isQuote && /\w/.test(prevChar));
        if (!glued) {
          e.preventDefault();
          applyEdit(
            value.slice(0, start) + ch + closer + value.slice(start),
            start + 1,
            start + 1
          );
          return;
        }
      }
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
      // sitting between an empty pair: remove both halves
      const before1 = value[start - 1];
      if (before1 && PAIRS[before1] === value[start]) {
        e.preventDefault();
        applyEdit(value.slice(0, start - 1) + value.slice(start + 1), start - 1, start - 1);
        return;
      }
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
          placeholder="# Write Python here, then press Ctrl+Enter"
        />
      </div>
    </div>
  );
}

/* ---------------- asset loading (module scope so the promise
   cache survives re-mounts) ---------------- */
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

export default function PythonVisualizerPage() {
  const [pyodide, setPyodide] = useState(null);
  const [loadingPyodide, setLoadingPyodide] = useState(true);
  const [pyodideFailed, setPyodideFailed] = useState(false);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [runError, setRunError] = useState("");
  const [running, setRunning] = useState(false);
  const [trace, setTrace] = useState([]);
  const [step, setStep] = useState(0);
  const [errorLine, setErrorLine] = useState(null);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [shown, setShown] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [codeWidth, setCodeWidth] = useState(DEFAULT_CODE_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [editorWrap, setEditorWrap] = useState(false);
  const [editorFont, setEditorFont] = useState(14);

  const rawInputsRef = useRef([]);
  const prefsLoadedRef = useRef(false);
  const traceRef = useRef([]);
  const codeRef = useRef(code);
  const runningRef = useRef(false);
  useEffect(() => { traceRef.current = trace; }, [trace]);
  useEffect(() => { codeRef.current = code; }, [code]);

  /* ---------- preferences ---------- */
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved) {
        if (typeof saved.code === "string" && saved.code.trim()) setCode(saved.code);
        if (typeof saved.font === "number") setEditorFont(saved.font);
        if (typeof saved.wrap === "boolean") setEditorWrap(saved.wrap);
        if (typeof saved.width === "number") setCodeWidth(saved.width);
        if (saved.theme === "light" || saved.theme === "dark") setTheme(saved.theme);
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
          JSON.stringify({ code, font: editorFont, wrap: editorWrap, width: codeWidth, theme })
        );
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [code, editorFont, editorWrap, codeWidth, theme]);

  /* ---------- Pyodide ---------- */
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 20);
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

  const pgLoggerLoadedRef = useRef(false);

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

  async function run(resume = false, inputsOverride = null) {
    if (!pyodide || runningRef.current) return;
    const source = codeRef.current;
    runningRef.current = true;
    setRunning(true);
    setRunError("");
    setErrorLine(null);
    try {
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
      const nextTrace = Array.isArray(data.trace) ? data.trace : [];

      // errors that end the program are the last entry of the trace
      const last = nextTrace[nextTrace.length - 1];
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
        if (fatal.line) setErrorLine(fatal.line);
      }

      // a syntax error (or anything that never ran) has no steps to draw
      const hasSteps = nextTrace.some(
        (ev) => ev && ev.event !== "uncaught_exception" && ev.event !== "raw_input"
      );
      if (!hasSteps) {
        setAwaitingInput(false);
        setTrace([]);
        setStep(0);
        if (!fatal) setRunError("No execution steps were produced. Check your code for syntax errors.");
        return;
      }

      const wantsInput = Boolean(last && last.event === "raw_input");
      setAwaitingInput(wantsInput);
      setTrace(nextTrace);
      // a program that stopped for input has its prompt on the final step
      setStep(wantsInput ? nextTrace.length - 1 : 0);
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
    setTrace([]);
    setStep(0);
    setErrorLine(null);
    setInputValue("");
    rawInputsRef.current = [];
  };

  const sendInput = () => {
    const next = [...(rawInputsRef.current || []), inputValue];
    rawInputsRef.current = next;
    setInputValue("");
    setAwaitingInput(false);
    run(true, next);
  };

  // editing invalidates the error marker
  useEffect(() => { setErrorLine(null); }, [code]);

  /* ---------- which lines the editor marks ---------- */
  const execLines = useMemo(() => {
    const cur = trace[step];
    if (!cur) return { cur: null, prev: null };
    const prevEntry = step > 0 ? trace[step - 1] : null;
    const prevLine = prevEntry ? prevEntry.line : null;
    const atEnd = step === trace.length - 1;
    const curLine = atEnd && prevLine === cur.line ? null : cur.line;
    return { cur: curLine, prev: prevLine };
  }, [trace, step]);

  /* ---------- keyboard stepping ---------- */
  useEffect(() => {
    const isTyping = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onKey = (e) => {
      if (isTyping(document.activeElement)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((i) => Math.max(0, i - 1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setStep((i) => Math.min(traceRef.current.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- splitter ---------- */
  const startDrag = (e) => {
    e.preventDefault();
    setDragging(true);
    const startX = e.clientX;
    const startWidth = codeWidth;
    const onMove = (ev) => {
      const max = Math.max(MIN_CODE_WIDTH, window.innerWidth - 420);
      setCodeWidth(Math.min(max, Math.max(MIN_CODE_WIDTH, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const entry = trace[step] || null;
  const total = trace.length;
  const terminated = total > 0 && step === total - 1 && !awaitingInput;
  const status = runError
    ? runError
    : awaitingInput
    ? "waiting for input"
    : !total
    ? loadingPyodide
      ? "loading Python…"
      : "ready when you are"
    : terminated
    ? "program terminated"
    : `about to run line ${entry.line}`;

  const go = (i) => setStep(Math.max(0, Math.min(total - 1, i)));

  return (
    <div
      className={`py-root ${shown ? "show" : ""} ${dragging ? "dragging" : ""}`}
      data-theme={theme}
      style={{ "--code-width": `${codeWidth}px` }}
    >
      <header className="py-header">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
              <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
              <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
              <rect x="14" y="14" width="6" height="6" rx="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">python visualizer</span>
        </div>

        <div className="header-right">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </button>

          <a className="home-link ghost" href="/python_old">old version</a>
          <a className="home-link" href="/">Home</a>
        </div>
      </header>

      <main className="py-main">
        <div className="left-col">
          <section className="pane code-pane">
            <div className="pane-head">
              <span className="pane-title">Code</span>
              <div className="code-tools">
                <select
                  className="example-select"
                  value=""
                  onChange={(e) => {
                    const found = EXAMPLES.find((x) => x.id === e.target.value);
                    if (found) {
                      setCode(found.code);
                      reset();
                    }
                    e.target.value = "";
                  }}
                  aria-label="Load an example"
                >
                  <option value="" disabled>Examples…</option>
                  {EXAMPLES.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.label}</option>
                  ))}
                </select>

                <label className="wrap-toggle" title="Wrap long lines">
                  <input type="checkbox" checked={editorWrap} onChange={(e) => setEditorWrap(e.target.checked)} />
                  <span>wrap</span>
                </label>

                <input
                  className="font-range"
                  type="range"
                  min={12}
                  max={20}
                  step={1}
                  value={editorFont}
                  onChange={(e) => setEditorFont(parseInt(e.target.value, 10))}
                  aria-label="Editor font size"
                  title={`Font size ${editorFont}px`}
                />
              </div>
            </div>

            <EditorWithGutter
              code={code}
              setCode={setCode}
              editorWrap={editorWrap}
              editorFont={editorFont}
              onRun={() => run(false)}
              curLine={execLines.cur}
              prevLine={execLines.prev}
              errorLine={errorLine}
            />

            <div className="legend">
              <span className="legend-item prev"><i /> line that just executed</span>
              <span className="legend-item cur"><i /> next line to execute</span>
              {errorLine && <span className="legend-item err"><i /> error</span>}
            </div>

            <div className="run-row">
              <button
                className={`run-btn ${running ? "busy" : ""}`}
                onClick={() => run(false)}
                disabled={!pyodide || running}
              >
                {running ? (
                  <>
                    <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                    Tracing…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    Visualize Execution
                  </>
                )}
              </button>
              <button className="ghost-btn" onClick={reset} disabled={running || !total}>Reset</button>
              <span className={`state ${loadingPyodide ? "loading" : pyodideFailed ? "bad" : "ok"}`}>
                {loadingPyodide ? "loading Python…" : pyodideFailed ? "failed to load" : "Python ready"}
              </span>
              <span className="steps-note">
                {total ? `${total} steps` : `${code.split("\n").length} lines`}
              </span>
            </div>

            {(runError || pyodideFailed) && (
              <div className="error-note">
                {runError || "Could not load the Python runtime. Check your connection and reload."}
              </div>
            )}
          </section>

          <section className="pane out-pane">
            <div className="pane-head">
              <span className="pane-title">Print output (stdout)</span>
              <span className="pane-note">up to the current step</span>
            </div>
            <pre className="stdout">{entry && entry.stdout ? entry.stdout : "— no output yet —"}</pre>
          </section>
        </div>

        <div
          className="splitter"
          onPointerDown={startDrag}
          onDoubleClick={() => setCodeWidth(DEFAULT_CODE_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the code panel"
          title="Drag to resize, double-click to reset"
        >
          <span />
        </div>

        <section className="canvas-pane">
          {total > 0 ? (
            <TraceViz trace={trace} step={step} />
          ) : (
            <div className="canvas-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <p>Write code and press Visualize Execution</p>
              <span>Frames and objects will be drawn here</span>
            </div>
          )}

          {awaitingInput && (
            <form
              className="input-pop"
              onSubmit={(e) => {
                e.preventDefault();
                sendInput();
              }}
            >
              <span className="input-pop-title">waiting for input</span>
              <span className="input-pop-prompt">{entry && entry.prompt ? entry.prompt : "Input"}</span>
              <div className="input-pop-row">
                <input
                  className="input-box"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="type a value, then Enter"
                  autoFocus
                  aria-label="Program input"
                />
                <button type="submit" className="send-btn">Send</button>
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="stepbar">
        <input
          className="stepbar-slider"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={step}
          onChange={(e) => go(parseInt(e.target.value, 10))}
          disabled={!total}
          aria-label="Execution step"
        />
        <div className="stepbar-buttons">
          <button onClick={() => go(0)} disabled={!total || step === 0}>&lt;&lt; First</button>
          <button onClick={() => go(step - 1)} disabled={!total || step === 0}>&lt; Prev</button>
          <span className="stepbar-count">
            {total ? <>Step <b>{step + 1}</b> of {total}</> : "no trace yet"}
          </span>
          <button onClick={() => go(step + 1)} disabled={!total || step >= total - 1}>Next &gt;</button>
          <button onClick={() => go(total - 1)} disabled={!total || step >= total - 1}>Last &gt;&gt;</button>
        </div>
        <span className={`stepbar-status ${runError ? "bad" : terminated ? "done" : ""}`}>{status}</span>
      </footer>
    </div>
  );
}
