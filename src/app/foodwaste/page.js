"use client";

/* The conference paper "A Comparison of Machine Learning and Deep Learning
   Models for Calories Burn Prediction" (MJU 7th National Conference on Science
   Technology and Innovation, 27 March 2026) as a web page. Every figure and
   number here comes from the deck and the abstract. */

import { useEffect, useState } from "react";
import "./foodwaste.css";

const PREFS_KEY = "foodwaste-theme";

const MODELS = [
  {
    id: "xgboost",
    name: "XGBoost",
    kind: "Gradient boosted trees",
    blurb:
      "Trees are added one at a time, each fitted to the error the ones before it left behind; the predictions are summed.",
    maeTrain: 0.9445,
    maeTest: 1.0991,
    mse: 2.4315,
    r2: 99.9398,
  },
  {
    id: "catboost",
    name: "CatBoost",
    kind: "Gradient boosted trees",
    blurb:
      "Also boosting, but ordered so a row's own target never leaks into the tree that predicts it, which keeps the loss from drifting.",
    maeTrain: 0.8909,
    maeTest: 0.9139,
    mse: 1.5665,
    r2: 99.9612,
  },
  {
    id: "mlp",
    name: "Multi-Layer Perceptron",
    kind: "Deep learning",
    blurb:
      "An input layer, hidden layers and an output layer. The hidden layers are what let it bend to the non-linear relationship between duration and heart rate.",
    maeTrain: 0.3091,
    maeTest: 0.322,
    mse: 0.1652,
    r2: 99.9959,
    best: true,
  },
];

const FIGURES = [
  {
    key: "fit",
    label: "Actual vs predicted",
    caption: "Predicted calories against the true value. The tighter the points hug the diagonal, the better.",
  },
  {
    key: "learning",
    label: "Learning curve",
    caption: "Training and validation error as the training set grows. Curves that meet and flatten mean neither under- nor overfitting.",
  },
  {
    key: "residual",
    label: "Residual plot",
    caption: "Error against predicted value. A flat random band around zero is what a well-specified model looks like.",
  },
];

const FIGURE_FILE = {
  "xgboost-fit": "/foodwaste/xgboost-fit.png",
  "xgboost-learning": "/foodwaste/xgboost-learning.png",
  "xgboost-residual": "/foodwaste/xgboost-residual.png",
  "catboost-fit": "/foodwaste/catboost-fit.png",
  "catboost-learning": "/foodwaste/catboost-learning.png",
  "catboost-residual": "/foodwaste/catboost-residual.png",
  "mlp-fit": "/foodwaste/mlp-fit.png",
  "mlp-learning": "/foodwaste/mlp-learning.png",
  "mlp-residual": "/foodwaste/mlp-residual.jpg",
};

const STEPS = [
  { no: "01", name: "Data overview", note: "15,000 records of calorie burn" },
  { no: "02", name: "Preprocessing", note: "encode, scale, select features" },
  { no: "03", name: "Data splitting", note: "12,000 train / 3,000 test" },
  { no: "04", name: "Model evaluation", note: "MSE, MAE, R²" },
  { no: "05", name: "Result", note: "compare the three models" },
];

function Section({ no, title, id, children }) {
  return (
    <section className="fw-section" id={id}>
      <div className="fw-section-head">
        <span className="fw-section-no">{no}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CaloriesBurnPage() {
  const [theme, setTheme] = useState("dark");
  const [figure, setFigure] = useState("fit");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, theme);
    } catch {}
  }, [theme]);

  const active = FIGURES.find((f) => f.key === figure) || FIGURES[0];

  return (
    <div className="fw-root" data-theme={theme}>
      <header className="fw-header">
        <div className="fw-brand">
          <span className="fw-brand-name">calories burn prediction</span>
          <span className="fw-brand-note">MJU 7th National Conference · 2026</span>
        </div>
        <div className="fw-header-right">
          <button
            type="button"
            className="fw-icon-btn"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            aria-label="Toggle theme"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
            </svg>
          </button>
          <a className="fw-btn" href="/">Home</a>
        </div>
      </header>

      <div className="fw-wrap">
        <div className="fw-hero">
          <span className="fw-kicker">
            The 7th National Conference on Science, Technology and Innovation · 27 March 2026
          </span>
          <h1 className="fw-title">
            A Comparison of Machine Learning and Deep Learning Models for{" "}
            <em>Calories Burn Prediction</em>
          </h1>
          <p className="fw-title-th">
            การเปรียบเทียบตัวแบบการเรียนรู้ของเครื่องและการเรียนรู้เชิงลึกสำหรับการพยากรณ์การเผาผลาญแคลอรี
          </p>
          <p className="fw-authors">
            <b>ณัฐชพล เกลียวกลม</b>, ทยากร ตากาบุตร, ธนินท์รัฐ ศรีสุพัฒน์ตา, จิราพัชร วงษ์ชุมภู,
            พีรพัฒน์ กันตา และ เฉลิมรัช นนทะภา
          </p>
          <p className="fw-affil">
            โครงการจัดตั้งศูนย์วิจัยวิทยาการข้อมูล และ ภาควิชาสถิติ คณะวิทยาศาสตร์ มหาวิทยาลัยเชียงใหม่
          </p>

          <div className="fw-headline">
            <div className="fw-stat win">
              <div className="fw-stat-label">Best model</div>
              <div className="fw-stat-value">MLP</div>
              <div className="fw-stat-note">Multi-Layer Perceptron</div>
            </div>
            <div className="fw-stat">
              <div className="fw-stat-label">R-Squared</div>
              <div className="fw-stat-value">99.9959%</div>
              <div className="fw-stat-note">on the held-out test set</div>
            </div>
            <div className="fw-stat">
              <div className="fw-stat-label">MSE</div>
              <div className="fw-stat-value">0.1652</div>
              <div className="fw-stat-note">MAE 0.3220</div>
            </div>
            <div className="fw-stat">
              <div className="fw-stat-label">Dataset</div>
              <div className="fw-stat-value">15,000</div>
              <div className="fw-stat-note">records, 80 / 20 split</div>
            </div>
          </div>
        </div>

        <Section no="01" title="Introduction" id="introduction">
          <p>
            In today&apos;s fast-paced society, regular exercise is vital for both physical health and
            cognitive function. Physical activity triggers the release of BDNF, which enhances focus and
            daily productivity (Festa, 2023). But strict time constraints mean a workout has to be
            efficient, and <strong>accurately tracking calorie expenditure</strong> is the metric a
            personalised, time-effective routine is designed around — turning exercise into a sustainable
            habit rather than another burden.
          </p>
        </Section>

        <Section no="02" title="Objectives" id="objectives">
          <ul className="fw-list">
            <li>Develop accurate and practical machine and deep learning models for calorie burn prediction.</li>
            <li>Compare performance, stability and error metrics across XGBoost, CatBoost and MLP regression.</li>
            <li>Investigate the factors that influence calorie burn using the data the models were built on.</li>
          </ul>
        </Section>

        <Section no="03" title="Literature review" id="literature">
          <div className="fw-cards">
            <div className="fw-card">
              <span className="fw-card-tag">Beebireddy, 2025</span>
              <p>
                Predicted calorie burn with seven models. The neural network reached{" "}
                <strong>98.87%</strong> accuracy — the strongest of the set.
              </p>
            </div>
            <div className="fw-card">
              <span className="fw-card-tag">Paria, n.d.</span>
              <p>
                Compared five machine learning models. CatBoost came first and XGBoost second, both
                around <strong>99%</strong>.
              </p>
            </div>
          </div>
        </Section>

        <Section no="04" title="Methodology" id="methodology">
          <div className="fw-steps">
            {STEPS.map((s) => (
              <div className="fw-step" key={s.no}>
                <div className="fw-step-no">{s.no}</div>
                <div className="fw-step-name">{s.name}</div>
                <div className="fw-step-note">{s.note}</div>
              </div>
            ))}
          </div>

          <div className="fw-vars" style={{ marginTop: 14 }}>
            <div className="fw-card">
              <h3>Data overview</h3>
              <p>15,000 records of calorie burn from physical activity.</p>
              <div className="fw-chiplist">
                <span className="fw-chip">gender</span>
                <span className="fw-chip">height</span>
                <span className="fw-chip">weight</span>
                <span className="fw-chip">duration</span>
                <span className="fw-chip">heart rate</span>
                <span className="fw-chip">body temperature</span>
              </div>
              <div className="fw-chiplist">
                <span className="fw-chip target">calories burned — target</span>
              </div>
            </div>

            <div className="fw-card">
              <h3>Preprocessing</h3>
              <p>
                Categorical values are encoded numerically, every variable is scaled to a common range so
                no single one biases the model, and <strong>forward selection</strong> keeps only the
                inputs that actually move the prediction.
              </p>
              <div className="fw-chiplist">
                <span className="fw-chip keep">gender</span>
                <span className="fw-chip keep">weight</span>
                <span className="fw-chip keep">duration</span>
                <span className="fw-chip keep">heart rate</span>
                <span className="fw-chip drop">height</span>
                <span className="fw-chip drop">body temperature</span>
              </div>
            </div>
          </div>

          <div className="fw-card" style={{ marginTop: 10 }}>
            <h3>Splitting and evaluation</h3>
            <p>
              The selected data is split <strong>80 / 20</strong> — 12,000 records to learn the patterns
              and 3,000 held back to measure accuracy. Three metrics judge the result:{" "}
              <strong>MSE</strong> (average squared difference between predicted and actual),{" "}
              <strong>MAE</strong> (average absolute difference) and <strong>R²</strong> (how much of the
              variation the model explains). Learning curves check for under- and overfitting; residual
              plots check the errors are random rather than patterned.
            </p>
          </div>
        </Section>

        <Section no="05" title="The three models" id="models">
          <div className="fw-cards">
            {MODELS.map((m) => (
              <div className="fw-card" key={m.id}>
                <span className="fw-card-tag">{m.kind}</span>
                <h3>{m.name}</h3>
                <p>{m.blurb}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section no="06" title="Results" id="results">
          <div className="fw-table-scroll">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>MAE (train)</th>
                  <th>MAE (test)</th>
                  <th>MSE</th>
                  <th>R²</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.id} className={m.best ? "best" : ""}>
                    <td>{m.name}</td>
                    <td>{m.maeTrain.toFixed(4)}</td>
                    <td>{m.maeTest.toFixed(4)}</td>
                    <td>{m.mse.toFixed(4)}</td>
                    <td>{m.r2.toFixed(4)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fw-caption">
            The MLP&apos;s training and testing MAE sit within 0.013 of each other, so the gap it wins by
            is not memorised training data.
          </p>

          <div style={{ marginTop: 22 }}>
            <div className="fw-tabs">
              {FIGURES.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`fw-tab ${figure === f.key ? "on" : ""}`}
                  onClick={() => setFigure(f.key)}
                  aria-pressed={figure === f.key}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="fw-figures">
              {MODELS.map((m) => (
                <figure className="fw-figure" key={m.id}>
                  <div className="fw-figure-head">{m.name}</div>
                  <div className="fw-figure-plate">
                    <img
                      src={FIGURE_FILE[`${m.id}-${figure}`]}
                      alt={`${active.label} for ${m.name}`}
                      loading="lazy"
                    />
                  </div>
                </figure>
              ))}
            </div>
            <p className="fw-caption">{active.caption}</p>
          </div>
        </Section>

        <Section no="07" title="Conclusion" id="conclusion">
          <p>
            The <strong>Multi-Layer Perceptron</strong> emerged as the most effective model, validated by
            all three metrics: an MSE of <strong>0.1652</strong>, an MAE of <strong>0.3220</strong> and{" "}
            <strong>99.9959%</strong> accuracy.
          </p>
        </Section>

        <Section no="08" title="Discussion" id="discussion">
          <p>
            The MLP captures the <strong>non-linear relationship between duration and heart rate</strong>{" "}
            better than XGBoost or CatBoost, which is where its higher accuracy comes from.
          </p>
          <p>
            This is consistent with Beebireddy (2025), where a neural network — the same underlying
            algorithm — reached 98.87%. The MLP here goes further, and forward feature selection plus data
            scaling are what account for the difference.
          </p>
        </Section>

        <Section no="09" title="Benefits" id="benefits">
          <div className="fw-cards">
            <div className="fw-card">
              <h3>Technological</h3>
              <p>
                A foundation for health support technology: fitness applications and smart activity
                tracking devices.
              </p>
            </div>
            <div className="fw-card">
              <h3>Health</h3>
              <p>
                A basic tool for analysing and designing exercise programmes, and for nutrition
                specialists planning systematic weight management.
              </p>
            </div>
          </div>
        </Section>

        <Section no="10" title="Limitations and future work" id="recommendation">
          <div className="fw-cards">
            <div className="fw-card">
              <h3>Limitations</h3>
              <ul className="fw-list">
                <li>The model only predicts calories burned during exercise.</li>
                <li>Individual variation in exercise form can reduce accuracy.</li>
              </ul>
            </div>
            <div className="fw-card">
              <h3>Future research</h3>
              <ul className="fw-list">
                <li>Build on this foundation towards more accurate models.</li>
                <li>Run real-world human trials and validate with domain experts.</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section no="11" title="References" id="references">
          <ol className="fw-refs">
            <li>
              Beebireddy, D., Harika, K. L., &amp; Adithya, K. (2025, January). Accurate Prediction of
              Calories Burn Using Deep Learning Approach. In <i>2025 International Conference on Next
              Generation Communication &amp; Information Processing (INCIP)</i> (pp. 530–534). IEEE.
            </li>
            <li>
              Paria, A., Pattan, K. I., Devi, M. R., Nandini, K., Revathi, V., &amp; Hiremath, S.
              Comparative analysis for calorie burn prediction using machine learning techniques. In{" "}
              <i>Smart Technologies and Intelligent Computing</i> (pp. 241–251). CRC Press.
            </li>
            <li>
              Festa, F., Medori, S., &amp; Macrì, M. (2023). Move your body, boost your brain: the
              positive impact of physical activity on cognition across all age groups.{" "}
              <i>Biomedicines, 11</i>(6), 1765.
            </li>
          </ol>
        </Section>

        <footer className="fw-footer">
          Figures reproduced from the presentation deck. Corresponding author: เฉลิมรัช นนทะภา ·
          chalermrat.n@cmu.ac.th
        </footer>
      </div>
    </div>
  );
}
