"use client";

/* The list of subjects. Each row is draggable onto the grid, which is the
   quickest way to add another session of something already on the list. */

import { useState } from "react";
import { subjectColor, subjectMinutes, formatHours } from "../lib/scheduleStore";

export default function SubjectSidebar({ subjects, onAdd, onDelete }) {
  const [dragging, setDragging] = useState(null);

  return (
    <aside className="sc-pane sc-no-export">
      <div className="sc-pane-head">
        <span className="sc-pane-title">Subjects</span>
        <button type="button" className="sc-btn" onClick={onAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          เพิ่มวิชา
        </button>
      </div>

      <div className="sc-side-body">
        {subjects.length === 0 ? (
          <div className="sc-empty">ยังไม่มีรายวิชา</div>
        ) : (
          subjects.map((subject) => {
            const color = subjectColor(subject);
            const minutes = subjectMinutes(subject);
            return (
              <div
                key={subject.id}
                className={`sc-subject ${dragging === subject.id ? "is-dragging" : ""}`}
                style={{ "--subject-color": color.bg }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", subject.id);
                  e.dataTransfer.effectAllowed = "copy";
                  setDragging(subject.id);
                }}
                onDragEnd={() => setDragging(null)}
                title="ลากไปวางบนตารางเพื่อเพิ่มคาบ"
              >
                <span className="sc-grip" aria-hidden="true">⠿</span>
                <div className="sc-subject-info">
                  <div className="sc-subject-name">{subject.name}</div>
                  {subject.code && <div className="sc-subject-code">{subject.code}</div>}
                </div>
                {minutes > 0 && (
                  <span className="sc-subject-hours">{formatHours(minutes)}ชม.</span>
                )}
                <button
                  type="button"
                  className="sc-del"
                  onClick={() => onDelete(subject.id)}
                  title="ลบวิชานี้และทุกคาบของมัน"
                  aria-label={`ลบ ${subject.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      {subjects.length > 0 && (
        <div className="sc-hint">ลากวิชาไปวางบนตาราง หรือคลิกช่องว่างเพื่อเพิ่มคาบ</div>
      )}
    </aside>
  );
}
