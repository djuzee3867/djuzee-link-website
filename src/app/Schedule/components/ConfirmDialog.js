"use client";

/* Confirm / alert. Was inline in page.js before; it is the same shape every
   time, and both callers wanted it, so it lives on its own now. */

export default function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <div className="sc-overlay" onClick={onClose}>
      <div className="sc-modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="sc-modal-head">
          <h2>{title}</h2>
        </div>
        <div className="sc-modal-body">
          <p className="sc-dialog-text">{message}</p>
        </div>
        <div className="sc-modal-foot">
          {onConfirm && (
            <button type="button" className="sc-btn" onClick={onClose}>
              ยกเลิก
            </button>
          )}
          <button
            type="button"
            className={`sc-btn ${danger ? "danger" : "primary"}`}
            onClick={onConfirm || onClose}
            autoFocus
          >
            {confirmLabel || (onConfirm ? "ยืนยัน" : "ตกลง")}
          </button>
        </div>
      </div>
    </div>
  );
}
