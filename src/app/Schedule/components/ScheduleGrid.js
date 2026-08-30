"use client";

/* The week grid. Columns are one per minute between DAY_START and DAY_END, so a
   session is placed by its real start and end rather than being snapped to the
   nearest hour; the hour rulings and the empty click targets simply span 60. */

import { useState } from "react";
import {
  DAYS,
  DAY_START,
  DAY_END,
  TIME_SLOTS,
  subjectColor,
  toMinutes,
  fromMinutes,
} from "../lib/scheduleStore";

const GRID_START = DAY_START * 60;
const TOTAL_MINUTES = (DAY_END - DAY_START) * 60;
const HOURS = DAY_END - DAY_START;

export default function ScheduleGrid({ subjects, onSlotClick, onSubjectDrop, onSessionClick }) {
  const [dropTarget, setDropTarget] = useState(null);
  // Sunday is 0 in JS but last in a Monday-first week
  const today = (new Date().getDay() + 6) % 7;

  return (
    <div className="sc-grid-scroll">
      <div
        className="sc-grid"
        style={{ gridTemplateColumns: `76px repeat(${TOTAL_MINUTES}, 1fr)` }}
      >
        <div className="sc-corner" style={{ gridColumn: 1, gridRow: 1 }}>
          วัน
        </div>

        {TIME_SLOTS.slice(0, -1).map((time, i) => (
          <div
            key={time}
            className="sc-time"
            style={{ gridColumn: `${2 + i * 60} / span 60`, gridRow: 1 }}
          >
            {time}
          </div>
        ))}

        {DAYS.map((day, di) => (
          <div key={day} style={{ display: "contents" }}>
            <div
              className={`sc-day ${di === today ? "today" : ""}`}
              style={{ gridColumn: 1, gridRow: di + 2 }}
            >
              {day}
            </div>

            {Array.from({ length: HOURS }).map((_, hi) => {
              const startTime = fromMinutes(GRID_START + hi * 60);
              const endTime = fromMinutes(GRID_START + (hi + 1) * 60);
              const key = `${di}-${hi}`;
              return (
                <div
                  key={key}
                  className={`sc-slot ${di % 2 ? "alt" : ""} ${
                    dropTarget === key ? "drop-target" : ""
                  }`}
                  style={{ gridColumn: `${2 + hi * 60} / span 60`, gridRow: di + 2 }}
                  title={`${DAYS[di]} ${startTime}`}
                  onClick={() => onSlotClick(di, startTime, endTime)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDropTarget(key);
                  }}
                  onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id) onSubjectDrop(id, di, startTime, endTime);
                  }}
                />
              );
            })}
          </div>
        ))}

        {subjects.map((subject) =>
          (subject.sessions || []).map((session) => {
            const start = Math.max(0, Math.min(toMinutes(session.startTime) - GRID_START, TOTAL_MINUTES));
            const end = Math.max(0, Math.min(toMinutes(session.endTime) - GRID_START, TOTAL_MINUTES));
            if (start >= end) return null;

            const color = subjectColor(subject);
            return (
              <button
                key={session.id}
                type="button"
                className="sc-session"
                style={{
                  gridColumn: `${2 + start} / ${2 + end}`,
                  gridRow: session.day + 2,
                  background: color.bg,
                  color: color.text || "#fff",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSessionClick(subject, session);
                }}
                title={`${subject.name} · ${session.startTime}–${session.endTime}`}
              >
                {subject.code && <span className="sc-session-code">{subject.code}</span>}
                <span className="sc-session-name">{subject.name}</span>
                <span className="sc-session-time">
                  {session.startTime}–{session.endTime}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
