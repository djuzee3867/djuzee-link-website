"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import "./qr.css";

const TYPES = [
  { id: "text", label: "ข้อความ / URL" },
  { id: "wifi", label: "Wi-Fi" },
  { id: "email", label: "อีเมล" },
  { id: "phone", label: "โทร / SMS" },
];

const SIZES = [256, 512, 1024];

const LEVELS = [
  { id: "L", label: "L", hint: "กู้คืนได้ 7% — โค้ดโปร่งที่สุด อ่านง่ายเมื่อพิมพ์เล็ก" },
  { id: "M", label: "M", hint: "กู้คืนได้ 15% — ค่ามาตรฐาน ใช้ได้กับงานทั่วไป" },
  { id: "Q", label: "Q", hint: "กู้คืนได้ 25% — เผื่อโค้ดโดนบังบางส่วน" },
  { id: "H", label: "H", hint: "กู้คืนได้ 30% — ทนรอยเปื้อนที่สุด แต่โค้ดจะถี่ขึ้น" },
];

/* Wi-Fi payloads escape \ ; , : and " with a backslash */
const escapeWifi = (s) => String(s).replace(/([\\;,:"])/g, "\\$1");

const looksLikeBareDomain = (s) => {
  const v = s.trim();
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) && !/^[a-z][\w+.-]*:/i.test(v);
};

function buildPayload(type, f) {
  if (type === "wifi") {
    if (!f.ssid.trim()) return "";
    const parts = [`T:${f.security}`, `S:${escapeWifi(f.ssid)}`];
    if (f.security !== "nopass" && f.password) parts.push(`P:${escapeWifi(f.password)}`);
    if (f.hidden) parts.push("H:true");
    return `WIFI:${parts.join(";")};;`;
  }
  if (type === "email") {
    if (!f.email.trim()) return "";
    const q = [];
    if (f.subject.trim()) q.push(`subject=${encodeURIComponent(f.subject)}`);
    if (f.body.trim()) q.push(`body=${encodeURIComponent(f.body)}`);
    return `mailto:${f.email.trim()}${q.length ? `?${q.join("&")}` : ""}`;
  }
  if (type === "phone") {
    const num = f.phone.replace(/[^\d+]/g, "");
    if (!num) return "";
    return f.sms ? `SMSTO:${num}:${f.message}` : `tel:${num}`;
  }
  return f.text.trim();
}

/* WCAG relative luminance, used to warn about codes that will not scan */
function luminance(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 0;
  const [r, g, b] = [1, 2, 3].map((i) => {
    const c = parseInt(m[i], 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function slugify(s) {
  const out = s
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/[^\w฀-๿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .toLowerCase();
  return out || "qrcode";
}

export default function QRGeneratorPage() {
  const [type, setType] = useState("text");
  const [fields, setFields] = useState({
    text: "",
    ssid: "",
    password: "",
    security: "WPA",
    hidden: false,
    email: "",
    subject: "",
    body: "",
    phone: "",
    sms: false,
    message: "",
  });

  const [fg, setFg] = useState("#111827");
  const [bg, setBg] = useState("#ffffff");
  const [transparent, setTransparent] = useState(false);
  const [size, setSize] = useState(512);
  const [level, setLevel] = useState("M");

  const [png, setPng] = useState(null);
  const [svg, setSvg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);

  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  const payload = useMemo(() => buildPayload(type, fields), [type, fields]);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 20);
    return () => clearTimeout(t);
  }, []);

  /* live preview: redraw shortly after the last change */
  useEffect(() => {
    if (!payload) {
      setPng(null);
      setSvg(null);
      setError("");
      return;
    }
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      const options = {
        errorCorrectionLevel: level,
        margin: 4, // the spec's quiet zone — anything smaller hurts scanning
        color: { dark: fg, light: transparent ? "#00000000" : bg },
      };
      try {
        const [dataUrl, svgText] = await Promise.all([
          QRCode.toDataURL(payload, { ...options, width: size }),
          QRCode.toString(payload, { ...options, type: "svg", width: size }),
        ]);
        if (cancelled) return;
        setPng(dataUrl);
        setSvg(svgText);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setPng(null);
        setSvg(null);
        const msg = e && e.message ? e.message : "";
        setError(
          /too long|big|data|length/i.test(msg)
            ? "ข้อความยาวเกินกว่าที่ QR เก็บได้ ลองย่อข้อความ หรือลดระดับการกู้คืนลง"
            : msg || "สร้าง QR ไม่สำเร็จ"
        );
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload, fg, bg, transparent, size, level]);

  const effectiveBg = transparent ? "#ffffff" : bg;
  const contrast = useMemo(() => contrastRatio(fg, effectiveBg), [fg, effectiveBg]);
  const inverted = useMemo(() => luminance(fg) > luminance(effectiveBg), [fg, effectiveBg]);
  const scanWarning = Boolean(payload) && !error && (contrast < 3 || inverted);
  const filename = useMemo(() => slugify(payload), [payload]);

  const download = useCallback(
    (href, ext, revoke) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (revoke) setTimeout(() => URL.revokeObjectURL(href), 1000);
    },
    [filename]
  );

  const downloadSvg = () => {
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    download(url, "svg", true);
  };

  const copyImage = async () => {
    if (!png) return;
    const flash = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };
    try {
      const blob = await (await fetch(png)).blob();
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      flash();
    } catch {
      try {
        await navigator.clipboard.writeText(payload);
        flash();
      } catch {}
    }
  };

  const bareDomain = type === "text" && looksLikeBareDomain(fields.text);

  return (
    <main className={`qr-page ${shown ? "show" : ""}`}>
      <div className="qr-orb orb1" />
      <div className="qr-orb orb2" />

      <div className="qr-shell">
        <header className="qr-header">
          <div className="qr-brand">
            <span className="qr-mark">
              <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
                <rect x="21" y="3" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
                <rect x="3" y="21" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" />
                <rect x="21" y="21" width="5" height="5" rx="1.5" fill="currentColor" />
                <rect x="28" y="28" width="5" height="5" rx="1.5" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h1 className="qr-title">QR Generator</h1>
              <p className="qr-sub">พิมพ์แล้วเห็นผลทันที ดาวน์โหลดได้ทั้ง PNG และ SVG</p>
            </div>
          </div>
          <a className="qr-home" href="/">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            หน้าแรก
          </a>
        </header>

        <div className="qr-grid">
          <section className="qr-form">
            <div className="seg" role="tablist" aria-label="ชนิดข้อมูล">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={type === t.id}
                  className={`seg-btn ${type === t.id ? "on" : ""}`}
                  onClick={() => setType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {type === "text" && (
              <div className="field">
                <label className="label" htmlFor="qr-text">ข้อความหรือลิงก์</label>
                <textarea
                  id="qr-text"
                  className="input area"
                  placeholder="https://example.com หรือข้อความอะไรก็ได้"
                  value={fields.text}
                  onChange={(e) => set("text", e.target.value)}
                  rows={4}
                />
                {bareDomain && (
                  <button type="button" className="hint-action" onClick={() => set("text", `https://${fields.text.trim()}`)}>
                    ดูเหมือนเป็นเว็บไซต์ — แตะเพื่อเติม https:// ให้สแกนแล้วเปิดลิงก์ได้เลย
                  </button>
                )}
              </div>
            )}

            {type === "wifi" && (
              <>
                <div className="field">
                  <label className="label" htmlFor="qr-ssid">ชื่อเครือข่าย (SSID)</label>
                  <input id="qr-ssid" className="input" value={fields.ssid} onChange={(e) => set("ssid", e.target.value)} placeholder="MyWiFi" />
                </div>
                <div className="row">
                  <div className="field">
                    <label className="label" htmlFor="qr-sec">ระบบความปลอดภัย</label>
                    <select id="qr-sec" className="input" value={fields.security} onChange={(e) => set("security", e.target.value)}>
                      <option value="WPA">WPA / WPA2 / WPA3</option>
                      <option value="WEP">WEP</option>
                      <option value="nopass">ไม่มีรหัสผ่าน</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="label" htmlFor="qr-pass">รหัสผ่าน</label>
                    <input
                      id="qr-pass"
                      className="input"
                      value={fields.password}
                      onChange={(e) => set("password", e.target.value)}
                      disabled={fields.security === "nopass"}
                      placeholder={fields.security === "nopass" ? "—" : "รหัส Wi-Fi"}
                    />
                  </div>
                </div>
                <label className="check">
                  <input type="checkbox" checked={fields.hidden} onChange={(e) => set("hidden", e.target.checked)} />
                  <span>เครือข่ายซ่อนชื่อ (hidden SSID)</span>
                </label>
                <p className="note">รหัสผ่านถูกฝังใน QR แบบอ่านออกได้ ใครสแกนก็เห็น เหมาะกับ Wi-Fi สำหรับแขก</p>
              </>
            )}

            {type === "email" && (
              <>
                <div className="field">
                  <label className="label" htmlFor="qr-email">ส่งถึง</label>
                  <input id="qr-email" className="input" type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="qr-subject">หัวข้อ</label>
                  <input id="qr-subject" className="input" value={fields.subject} onChange={(e) => set("subject", e.target.value)} placeholder="ไม่ใส่ก็ได้" />
                </div>
                <div className="field">
                  <label className="label" htmlFor="qr-body">ข้อความ</label>
                  <textarea id="qr-body" className="input area" rows={3} value={fields.body} onChange={(e) => set("body", e.target.value)} placeholder="ไม่ใส่ก็ได้" />
                </div>
              </>
            )}

            {type === "phone" && (
              <>
                <div className="field">
                  <label className="label" htmlFor="qr-phone">เบอร์โทร</label>
                  <input id="qr-phone" className="input" type="tel" value={fields.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+66812345678" />
                </div>
                <label className="check">
                  <input type="checkbox" checked={fields.sms} onChange={(e) => set("sms", e.target.checked)} />
                  <span>สแกนแล้วเปิดหน้าส่ง SMS แทนการโทร</span>
                </label>
                {fields.sms && (
                  <div className="field">
                    <label className="label" htmlFor="qr-msg">ข้อความตั้งต้น</label>
                    <input id="qr-msg" className="input" value={fields.message} onChange={(e) => set("message", e.target.value)} placeholder="ไม่ใส่ก็ได้" />
                  </div>
                )}
              </>
            )}

            <div className="divider" />

            <div className="row">
              <div className="field">
                <label className="label" htmlFor="qr-fg">สีโค้ด</label>
                <div className="color">
                  <input id="qr-fg" type="color" value={fg} onChange={(e) => setFg(e.target.value)} />
                  <input
                    className="input hex"
                    value={fg}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setFg(v.startsWith("#") ? v : `#${v}`);
                    }}
                    spellCheck={false}
                    aria-label="รหัสสีโค้ด"
                  />
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor="qr-bg">สีพื้นหลัง</label>
                <div className={`color ${transparent ? "off" : ""}`}>
                  <input id="qr-bg" type="color" value={bg} onChange={(e) => setBg(e.target.value)} disabled={transparent} />
                  <input
                    className="input hex"
                    value={transparent ? "โปร่งใส" : bg}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setBg(v.startsWith("#") ? v : `#${v}`);
                    }}
                    disabled={transparent}
                    spellCheck={false}
                    aria-label="รหัสสีพื้นหลัง"
                  />
                </div>
              </div>
            </div>

            <label className="switch-row">
              <span>พื้นหลังโปร่งใส (PNG / SVG)</span>
              <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>

            <div className="row">
              <div className="field">
                <span className="label">ขนาด PNG</span>
                <div className="seg small">
                  {SIZES.map((s) => (
                    <button key={s} type="button" className={`seg-btn ${size === s ? "on" : ""}`} onClick={() => setSize(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span className="label">ระดับการกู้คืน</span>
                <div className="seg small">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={`seg-btn ${level === l.id ? "on" : ""}`}
                      onClick={() => setLevel(l.id)}
                      title={l.hint}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="note">{LEVELS.find((l) => l.id === level).hint}</p>
          </section>

          <section className="qr-preview">
            <div className="preview-card">
              <div className={`stage ${transparent ? "checker" : ""} ${busy ? "busy" : ""}`}>
                {png ? (
                  <img src={png} alt="QR code ที่สร้างขึ้น" className="qr-img" />
                ) : (
                  <div className="stage-empty">
                    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
                      <rect x="6" y="6" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                      <rect x="38" y="6" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                      <rect x="6" y="38" width="20" height="20" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                      <rect x="38" y="38" width="8" height="8" rx="2" fill="currentColor" opacity="0.5" />
                      <rect x="50" y="50" width="8" height="8" rx="2" fill="currentColor" opacity="0.5" />
                    </svg>
                    <p>กรอกข้อมูลด้านซ้าย แล้ว QR จะขึ้นตรงนี้เอง</p>
                  </div>
                )}
              </div>

              {error && <p className="alert error">{error}</p>}
              {scanWarning && (
                <p className="alert warn">
                  {inverted
                    ? "สีโค้ดสว่างกว่าพื้นหลัง เครื่องสแกนหลายรุ่นอ่านไม่ออก ลองสลับสีกัน"
                    : `สีตัดกันน้อยไป (${contrast.toFixed(1)}:1) ควรมีอย่างน้อย 3:1 เพื่อให้สแกนติด`}
                </p>
              )}

              <div className="tags">
                <span className="tag">{size}×{size}</span>
                <span className="tag">ระดับ {level}</span>
                {transparent && <span className="tag ok">โปร่งใส</span>}
                {payload && <span className="tag">{payload.length} ตัวอักษร</span>}
              </div>

              <div className="actions">
                <button type="button" className="btn primary" onClick={() => png && download(png, "png")} disabled={!png}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  ดาวน์โหลด PNG
                </button>
                <button type="button" className="btn" onClick={downloadSvg} disabled={!svg}>SVG</button>
                <button type="button" className="btn" onClick={copyImage} disabled={!png}>
                  {copied ? "คัดลอกแล้ว" : "คัดลอกรูป"}
                </button>
              </div>

              <p className="note center">SVG ขยายได้ไม่แตก เหมาะกับงานพิมพ์</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
