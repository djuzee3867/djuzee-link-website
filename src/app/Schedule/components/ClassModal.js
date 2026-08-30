"use client";

/* Add or edit a subject, optionally with the times it meets.

   onSave returns null when it took the data, or a message when it refused
   (a clash with something already on the grid). The message is shown in place
   rather than in a popup, so the form the reader has to fix stays on screen. */

import { useEffect, useState } from "react";
import {
  DAYS,
  DAYS_SHORT,
  SUBJECT_COLORS,
  generateId,
  getContrastYIQ,
  nextColorIndex,
  parseTime,
  toMinutes,
} from "../lib/scheduleStore";

export default function ClassModal({ subjects, prefill, onSave, onClose }) {
  const [form, setForm] = useState({
    code: prefill?.code || "",
    name: prefill?.name || "",
    colorMode: prefill?.color ? "custom" : "preset",
    colorIndex: prefill?.colorIndex ?? nextColorIndex(subjects),
    customColor: prefill?.color?.bg || "#6366f1",
    days: prefill?.days || (prefill?.day !== undefined ? [prefill.day] : [0]),
    startTime: prefill?.startTime || "08:00",
    endTime: prefill?.endTime || "09:00",
  });
  const [hasSession, setHasSession] = useState(
    Boolean(prefill?.startTime) || Boolean(prefill?.isEdit)
  );
  const [error, setError] = useState("");

  // typing the name of a subject that already exists adopts its code and colour
  useEffect(() => {
    if (prefill?.isEdit) return;
    const existing = subjects.find((s) => s.name === form.name);
    if (!existing) return;
    setForm((prev) => ({
      ...prev,
      code: existing.code || "",
      colorMode: existing.color ? "custom" : "preset",
      colorIndex: existing.colorIndex ?? 0,
      customColor: existing.color?.bg || "#6366f1",
    }));
  }, [form.name, subjects, prefill]);

  const toggleDay = (index) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(index)
        ? prev.days.filter((d) => d !== index)
        : [...prev.days, index].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("กรุณาใส่ชื่อวิชา");
      return;
    }

    const start = parseTime(form.startTime, "08:00");
    const end = parseTime(form.endTime, "09:00");

    if (hasSession) {
      if (form.days.length === 0) {
        setError("เลือกวันอย่างน้อย 1 วัน");
        return;
      }
      if (toMinutes(start) >= toMinutes(end)) {
        setError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
        return;
      }
    }

    const subjectData = {
      id: subjects.find((s) => s.name === form.name.trim())?.id || generateId(),
      code: form.code.trim(),
      name: form.name.trim(),
      colorIndex: form.colorMode === "preset" ? form.colorIndex : null,
      color:
        form.colorMode === "custom"
          ? { bg: form.customColor, text: getContrastYIQ(form.customColor) }
          : null,
    };

    const sessionsData = hasSession
      ? form.days.map((day) => ({
          id: generateId(),
          day: Number(day),
          startTime: start,
          endTime: end,
        }))
      : null;

    const problem = onSave(subjectData, sessionsData, prefill?.isEdit ? prefill.sessionId : null);
    if (problem) setError(problem);
  };

  const current =
    form.colorMode === "custom"
      ? { bg: form.customColor, text: getContrastYIQ(form.customColor) }
      : SUBJECT_COLORS[form.colorIndex];

  const title = prefill?.isEdit ? "แก้ไขคาบเรียน" : prefill ? "เพิ่มคาบเรียน" : "เพิ่มรายวิชา";

  return (
    <div className="sc-overlay" onClick={onClose}>
      <form className="sc-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="sc-modal-head">
          <h2>{title}</h2>
          <button type="button" className="sc-icon-btn" onClick={onClose} aria-label="ปิด">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="sc-modal-body">
          <div className="sc-field sc-row-2">
            <div>
              <label className="sc-label" htmlFor="sc-code">รหัสวิชา</label>
              <input
                id="sc-code"
                className="sc-input mono"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="01000001"
              />
            </div>
            <div style={{ flex: 2 }}>
              <label className="sc-label" htmlFor="sc-name">ชื่อวิชา *</label>
              <input
                id="sc-name"
                className="sc-input"
                list="sc-subject-names"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Calculus 2"
                autoFocus
                required
              />
              <datalist id="sc-subject-names">
                {subjects.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="sc-field">
            <span className="sc-label">สี</span>
            <div className="sc-swatches">
              {SUBJECT_COLORS.map((color, i) => (
                <button
                  key={color.bg}
                  type="button"
                  className={`sc-swatch ${
                    form.colorMode === "preset" && form.colorIndex === i ? "on" : ""
                  }`}
                  style={{ background: color.bg }}
                  onClick={() => setForm({ ...form, colorMode: "preset", colorIndex: i })}
                  aria-label={`สีที่ ${i + 1}`}
                />
              ))}
              <label
                className={`sc-swatch custom ${form.colorMode === "custom" ? "on" : ""}`}
                style={
                  form.colorMode === "custom" ? { background: form.customColor } : undefined
                }
                title="เลือกสีเอง"
              >
                {form.colorMode !== "custom" && "+"}
                <input
                  type="color"
                  value={form.customColor}
                  onChange={(e) =>
                    setForm({ ...form, colorMode: "custom", customColor: e.target.value })
                  }
                />
              </label>
            </div>
          </div>

          <div className="sc-field">
            <label className="sc-check">
              <input
                type="checkbox"
                checked={hasSession}
                onChange={(e) => setHasSession(e.target.checked)}
              />
              ระบุเวลาเรียน
            </label>
          </div>

          {hasSession && (
            <>
              <div className="sc-field">
                <span className="sc-label">วัน (เลือกได้หลายวัน)</span>
                <div className="sc-days">
                  {DAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      className={`sc-day-btn ${form.days.includes(i) ? "on" : ""}`}
                      onClick={() => toggleDay(i)}
                      aria-pressed={form.days.includes(i)}
                    >
                      {DAYS_SHORT[i]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sc-field sc-row-2">
                <div>
                  <label className="sc-label" htmlFor="sc-start">เวลาเริ่ม</label>
                  <input
                    id="sc-start"
                    className="sc-input mono"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    onBlur={() =>
                      setForm((p) => ({ ...p, startTime: parseTime(p.startTime, "08:00") }))
                    }
                    placeholder="800"
                    required
                  />
                </div>
                <div>
                  <label className="sc-label" htmlFor="sc-end">เวลาสิ้นสุด</label>
                  <input
                    id="sc-end"
                    className="sc-input mono"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    onBlur={() =>
                      setForm((p) => ({ ...p, endTime: parseTime(p.endTime, "09:00") }))
                    }
                    placeholder="1000"
                    required
                  />
                </div>
              </div>
              <p className="sc-hint" style={{ padding: 0 }}>
                พิมพ์สั้นๆ ได้ เช่น 830 จะกลายเป็น 08:30 · ตารางรับเวลา 08:00–18:00
              </p>
            </>
          )}

          {error && <div className="sc-error">{error}</div>}
        </div>

        <div className="sc-modal-foot">
          <button type="button" className="sc-btn" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="submit"
            className="sc-btn primary"
            style={{ background: current.bg, color: current.text || "#fff" }}
          >
            บันทึก
          </button>
        </div>
      </form>
    </div>
  );
}
