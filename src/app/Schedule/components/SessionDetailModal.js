"use client";

/* What one session on the grid is, with the two things you can do to it. */

import { DAYS, subjectColor, toMinutes, formatHours } from "../lib/scheduleStore";

export default function SessionDetailModal({ subject, session, onEdit, onDelete, onClose }) {
  const color = subjectColor(subject);
  const length = toMinutes(session.endTime) - toMinutes(session.startTime);

  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="sc-modal-bar" style={{ background: color.bg }} />

        <div className="sc-modal-head">
          <h2>รายละเอียดคาบเรียน</h2>
          <button type="button" className="sc-icon-btn" onClick={onClose} aria-label="ปิด">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="sc-modal-body">
          <span
            className="sc-chip-name"
            style={{ background: color.bg, color: color.text || "#fff" }}
          >
            {subject.code ? `${subject.code} · ` : ""}
            {subject.name}
          </span>

          <div className="sc-info">
            <div className="sc-info-row">
              <span className="sc-info-label">วัน</span>
              <span className="sc-info-value">{DAYS[session.day]}</span>
            </div>
            <div className="sc-info-row">
              <span className="sc-info-label">เวลา</span>
              <span className="sc-info-value">
                {session.startTime} – {session.endTime} น.
              </span>
            </div>
            <div className="sc-info-row">
              <span className="sc-info-label">ความยาว</span>
              <span className="sc-info-value">{formatHours(length)} ชั่วโมง</span>
            </div>
          </div>
        </div>

        <div className="sc-modal-foot split">
          <button type="button" className="sc-btn danger" onClick={() => onDelete(subject.id, session.id)}>
            ลบคาบนี้
          </button>
          <button type="button" className="sc-btn primary" onClick={() => onEdit(subject, session)}>
            แก้ไข
          </button>
        </div>
      </div>
    </div>
  );
}
