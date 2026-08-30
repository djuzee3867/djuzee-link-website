/* Shape of the data, and the time arithmetic every other file leans on.

   A subject owns its sessions:
     { id, code, name, colorIndex | null, color: {bg, text} | null, sessions: [] }
     session = { id, day: 0-6, startTime: "HH:MM", endTime: "HH:MM" }
*/

export const DAY_START = 8;   // the grid runs 08:00 .. 18:00
export const DAY_END = 18;

export const TIME_SLOTS = Array.from(
  { length: DAY_END - DAY_START + 1 },
  (_, i) => `${String(DAY_START + i).padStart(2, "0")}:00`
);

export const DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
export const DAYS_SHORT = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

/* Ten hues that can all carry white text on a 12px card label. The bright
   mid-tones you reach for first cannot: white on #22c55e is 2.3:1, so a class
   name sitting on it is barely readable. Every entry here clears 4.5:1. */
export const SUBJECT_COLORS = [
  { bg: "#dc2626", text: "#fff" }, // 4.83
  { bg: "#c2410c", text: "#fff" }, // 5.18
  { bg: "#a16207", text: "#fff" }, // 4.92
  { bg: "#15803d", text: "#fff" }, // 5.02
  { bg: "#0f766e", text: "#fff" }, // 5.47
  { bg: "#0369a1", text: "#fff" }, // 5.93
  { bg: "#4f46e5", text: "#fff" }, // 6.29
  { bg: "#9333ea", text: "#fff" }, // 5.38
  { bg: "#db2777", text: "#fff" }, // 4.60
  { bg: "#475569", text: "#fff" }, // 7.58
];

export function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

/* Black or white text, whichever the background can carry. */
export function getContrastYIQ(hexcolor) {
  let hex = String(hexcolor).replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((x) => x + x).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1a1a2e" : "#ffffff";
}

/* The next preset nobody is using yet, so two subjects added in a row do not
   both come out the same red. Falls back to the least used once all ten are
   spoken for. */
export function nextColorIndex(subjects) {
  const used = new Array(SUBJECT_COLORS.length).fill(0);
  subjects.forEach((s) => {
    if (s.colorIndex != null && used[s.colorIndex] !== undefined) used[s.colorIndex] += 1;
  });
  let best = 0;
  for (let i = 1; i < used.length; i += 1) if (used[i] < used[best]) best = i;
  return best;
}

export function subjectColor(subject) {
  return subject.color || SUBJECT_COLORS[subject.colorIndex] || SUBJECT_COLORS[0];
}

/* ---------------------------------------------------------------- time */

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function fromMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* Accepts what people actually type: "8", "830", "8:30", "08.30" all land on
   a real time. Anything outside the grid is pulled back to its edge. */
export function parseTime(input, fallback = "08:00") {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return fallback;

  let str = digits;
  if (str.length === 1) str = `0${str}00`;
  else if (str.length === 2) str = `${str}00`;
  else if (str.length === 3) str = `0${str}`;
  else if (str.length > 4) str = str.slice(0, 4);

  let h = parseInt(str.slice(0, 2), 10);
  let m = parseInt(str.slice(2, 4), 10);
  if (Number.isNaN(h)) return fallback;
  if (Number.isNaN(m) || m > 59) m = 0;

  if (h < DAY_START) { h = DAY_START; m = 0; }
  if (h > DAY_END || (h === DAY_END && m > 0)) { h = DAY_END; m = 0; }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatHours(minutes) {
  if (!minutes) return "0";
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/* ---------------------------------------------------------------- queries */

export function allSessions(subjects) {
  const out = [];
  subjects.forEach((subject) => {
    (subject.sessions || []).forEach((session) => {
      if (session.startTime && session.endTime) out.push({ subject, session });
    });
  });
  return out;
}

export function subjectMinutes(subject) {
  return (subject.sessions || []).reduce(
    (sum, s) => sum + Math.max(0, toMinutes(s.endTime) - toMinutes(s.startTime)),
    0
  );
}

export function totalMinutes(subjects) {
  return subjects.reduce((sum, s) => sum + subjectMinutes(s), 0);
}

/* The first existing session any of `candidates` would sit on top of.
   `ignoreId` lets an edit skip the session it is replacing. */
export function findConflict(subjects, candidates, ignoreId = null) {
  for (const candidate of candidates || []) {
    const start = toMinutes(candidate.startTime);
    const end = toMinutes(candidate.endTime);
    for (const subject of subjects) {
      for (const session of subject.sessions || []) {
        if (session.id === ignoreId) continue;
        if (session.day !== candidate.day) continue;
        if (start < toMinutes(session.endTime) && end > toMinutes(session.startTime)) {
          return { subject, session, day: candidate.day };
        }
      }
    }
  }
  return null;
}
