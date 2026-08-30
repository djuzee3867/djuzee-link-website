"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ScheduleGrid from "./components/ScheduleGrid";
import SubjectSidebar from "./components/SubjectSidebar";
import ClassModal from "./components/ClassModal";
import SessionDetailModal from "./components/SessionDetailModal";
import ConfirmDialog from "./components/ConfirmDialog";
import {
  DAYS,
  TIME_SLOTS,
  allSessions,
  findConflict,
  formatHours,
  subjectColor,
  totalMinutes,
} from "./lib/scheduleStore";
import "./schedule.css";

// unchanged from the previous version on purpose: anyone who already has a
// timetable saved keeps it
const STORAGE_KEY = "schedule_subjects_v9";
const PREFS_KEY = "schedule_prefs_v1";

export default function SchedulePage() {
  const [subjects, setSubjects] = useState([]);
  const [theme, setTheme] = useState("dark");
  const [loaded, setLoaded] = useState(false);

  const [classModal, setClassModal] = useState(null); // null | { prefill }
  const [detail, setDetail] = useState(null); // null | { subject, session }
  const [dialog, setDialog] = useState(null);
  const [exporting, setExporting] = useState(false);

  const captureRef = useRef(null);

  /* ---------- storage ---------- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setSubjects(parsed);
      }
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
      if (prefs?.theme === "light" || prefs?.theme === "dark") setTheme(prefs.theme);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme }));
    } catch {}
  }, [subjects, theme, loaded]);

  /* ---------- saving a subject / its sessions ---------- */
  const handleSave = useCallback(
    (subjectData, sessionsData, editSessionId) => {
      const clash = findConflict(subjects, sessionsData, editSessionId);
      if (clash) {
        // handing the message back keeps the form open on the field to fix
        return `เวลาชนกับวิชา "${clash.subject.name}" (${DAYS[clash.day]} ${clash.session.startTime}–${clash.session.endTime})`;
      }

      setSubjects((prev) => {
        let next = prev;
        if (editSessionId) {
          next = next.map((s) => ({
            ...s,
            sessions: (s.sessions || []).filter((se) => se.id !== editSessionId),
          }));
        }

        const at = next.findIndex((s) => s.name === subjectData.name);
        if (at >= 0) {
          const existing = next[at];
          const merged = {
            ...existing,
            ...subjectData,
            id: existing.id,
            sessions: [...(existing.sessions || []), ...(sessionsData || [])],
          };
          next = next.map((s, i) => (i === at ? merged : s));
        } else {
          next = [...next, { ...subjectData, sessions: sessionsData || [] }];
        }
        return next;
      });

      setClassModal(null);
      return null;
    },
    [subjects]
  );

  const handleDeleteSession = (subjectId, sessionId) => {
    setDetail(null);
    setDialog({
      title: "ลบคาบเรียน?",
      message: "คาบนี้จะหายไปจากตาราง แต่ตัววิชายังอยู่ในรายการ",
      danger: true,
      confirmLabel: "ลบ",
      onConfirm: () => {
        setSubjects((prev) =>
          prev.map((s) =>
            s.id === subjectId
              ? { ...s, sessions: (s.sessions || []).filter((se) => se.id !== sessionId) }
              : s
          )
        );
        setDialog(null);
      },
    });
  };

  const handleDeleteSubject = (subjectId) => {
    const subject = subjects.find((s) => s.id === subjectId);
    const count = (subject?.sessions || []).length;
    setDialog({
      title: "ลบวิชานี้?",
      message: count
        ? `"${subject.name}" และคาบเรียนอีก ${count} คาบจะถูกลบทั้งหมด`
        : `"${subject?.name}" จะถูกลบออกจากรายการ`,
      danger: true,
      confirmLabel: "ลบ",
      onConfirm: () => {
        setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
        setDialog(null);
      },
    });
  };

  const handleClearAll = () => {
    setDialog({
      title: "ล้างตารางทั้งหมด?",
      message: "ทุกวิชาและทุกคาบจะถูกลบ กู้คืนไม่ได้",
      danger: true,
      confirmLabel: "ล้างทั้งหมด",
      onConfirm: () => {
        setSubjects([]);
        setDialog(null);
      },
    });
  };

  /* ---------- png ---------- */
  const handleExport = async () => {
    const target = captureRef.current;
    if (!target || exporting) return;
    setExporting(true);
    const originalWidth = target.style.width;
    try {
      // html2canvas paints whatever is on screen, so the shot is pinned to a
      // desktop width; without this a phone exports a squashed timetable
      target.style.width = "1280px";
      await new Promise((r) => setTimeout(r, 220));

      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(target, {
        backgroundColor: theme === "dark" ? "#0d0e15" : "#eef1f6",
        scale: 2,
        useCORS: true,
        windowWidth: 1280,
      });

      const link = document.createElement("a");
      link.download = `schedule-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error(err);
      setDialog({ title: "บันทึกรูปไม่สำเร็จ", message: String(err?.message || err) });
    } finally {
      target.style.width = originalWidth;
      setExporting(false);
    }
  };

  /* ---------- derived ---------- */
  const sessions = useMemo(() => allSessions(subjects), [subjects]);
  const weekMinutes = useMemo(() => totalMinutes(subjects), [subjects]);

  const byDay = useMemo(
    () =>
      DAYS.map((name, index) => ({
        name,
        index,
        items: sessions
          .filter((s) => s.session.day === index)
          .sort((a, b) => a.session.startTime.localeCompare(b.session.startTime)),
      })).filter((d) => d.items.length > 0),
    [sessions]
  );

  const openAdd = (prefill = null) => setClassModal({ prefill });

  return (
    <div
      className={`sc-root ${exporting ? "exporting" : ""}`}
      data-theme={theme}
      style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.2s ease" }}
      ref={captureRef}
    >
      <header className="sc-header">
        <div className="sc-brand">
          <span className="sc-brand-name">class schedule</span>
          <span className="sc-brand-note">
            {subjects.length
              ? `${subjects.length} วิชา · ${formatHours(weekMinutes)} ชม./สัปดาห์`
              : "ตารางเรียนรายสัปดาห์"}
          </span>
        </div>

        <div className="sc-header-right sc-no-export" data-html2canvas-ignore="true">
          <button type="button" className="sc-btn primary" onClick={() => openAdd()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="sc-btn-text">เพิ่มวิชา</span>
          </button>

          <button
            type="button"
            className="sc-btn"
            onClick={handleExport}
            disabled={exporting || sessions.length === 0}
            title="บันทึกตารางเป็นรูป PNG"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            <span className="sc-btn-text">{exporting ? "กำลังบันทึก…" : "บันทึกรูป"}</span>
          </button>

          <button
            type="button"
            className="sc-btn danger"
            onClick={handleClearAll}
            disabled={subjects.length === 0}
            title="ล้างตารางทั้งหมด"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
            <span className="sc-btn-text">ล้าง</span>
          </button>

          <button
            type="button"
            className="sc-icon-btn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </button>

          <a className="sc-btn" href="/">Home</a>
        </div>
      </header>

      <main className="sc-main">
        <SubjectSidebar
          subjects={subjects}
          onAdd={() => openAdd()}
          onDelete={handleDeleteSubject}
        />

        <div className="sc-content">
          <section className="sc-pane">
            <div className="sc-pane-head">
              <span className="sc-pane-title">Week</span>
              <div className="sc-badges">
                <span className="sc-badge">
                  {TIME_SLOTS[0]}–{TIME_SLOTS[TIME_SLOTS.length - 1]}
                </span>
                <span className="sc-pane-note sc-no-export" data-html2canvas-ignore="true">
                  คลิกช่องว่างเพื่อเพิ่มคาบ
                </span>
              </div>
            </div>
            <ScheduleGrid
              subjects={subjects}
              onSlotClick={(day, startTime, endTime) => openAdd({ day, startTime, endTime })}
              onSubjectDrop={(subjectId, day, startTime, endTime) => {
                const subject = subjects.find((s) => s.id === subjectId);
                if (!subject) return;
                openAdd({
                  day,
                  startTime,
                  endTime,
                  name: subject.name,
                  code: subject.code,
                  colorIndex: subject.colorIndex,
                  color: subject.color,
                });
              }}
              onSessionClick={(subject, session) => setDetail({ subject, session })}
            />
          </section>

          {sessions.length > 0 && (
            <section className="sc-pane">
              <div className="sc-pane-head">
                <span className="sc-pane-title">Summary</span>
                <div className="sc-badges">
                  <span className="sc-badge">{subjects.length} วิชา</span>
                  <span className="sc-badge">{sessions.length} คาบ</span>
                  <span className="sc-badge accent">{formatHours(weekMinutes)} ชม./สัปดาห์</span>
                </div>
              </div>

              <div className="sc-summary">
                {byDay.map((day) => {
                  const minutes = day.items.reduce((sum, { session }) => {
                    const [sh, sm] = session.startTime.split(":").map(Number);
                    const [eh, em] = session.endTime.split(":").map(Number);
                    return sum + (eh * 60 + em) - (sh * 60 + sm);
                  }, 0);
                  return (
                    <div key={day.index} className="sc-day-card">
                      <div className="sc-day-card-head">
                        <span>{day.name}</span>
                        <span className="sc-badge">{formatHours(minutes)} ชม.</span>
                      </div>
                      {day.items.map(({ subject, session }) => (
                        <div key={session.id} className="sc-row">
                          <span
                            className="sc-row-bar"
                            style={{ background: subjectColor(subject).bg }}
                          />
                          <div className="sc-row-info">
                            <div className="sc-row-name">{subject.name}</div>
                            <div className="sc-row-meta">
                              {session.startTime}–{session.endTime}
                              {subject.code ? ` · ${subject.code}` : ""}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="sc-del sc-no-export"
                            data-html2canvas-ignore="true"
                            onClick={() => handleDeleteSession(subject.id, session.id)}
                            aria-label="ลบคาบนี้"
                            title="ลบคาบนี้"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {classModal && (
        <ClassModal
          subjects={subjects}
          prefill={classModal.prefill}
          onSave={handleSave}
          onClose={() => setClassModal(null)}
        />
      )}

      {detail && (
        <SessionDetailModal
          subject={detail.subject}
          session={detail.session}
          onEdit={(subject, session) => {
            setDetail(null);
            openAdd({
              isEdit: true,
              sessionId: session.id,
              subjectId: subject.id,
              code: subject.code,
              name: subject.name,
              colorIndex: subject.colorIndex,
              color: subject.color,
              day: session.day,
              days: [session.day],
              startTime: session.startTime,
              endTime: session.endTime,
            });
          }}
          onDelete={handleDeleteSession}
          onClose={() => setDetail(null)}
        />
      )}

      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          danger={dialog.danger}
          confirmLabel={dialog.confirmLabel}
          onConfirm={dialog.onConfirm}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
