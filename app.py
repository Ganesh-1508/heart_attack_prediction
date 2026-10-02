"""
AI-Powered Heart Attack Risk Prediction & Decision Support System
Flask backend with prediction API, feature importance, PDF reports,
and persistent SQLite-backed patient history.
"""

import pickle
import io
import math
import numpy as np
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
from fpdf import FPDF
import db

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Load pre-trained model and scaler
model = pickle.load(open("model.pkl", "rb"))
scaler = pickle.load(open("scaler (1).pkl", "rb"))

FEATURE_NAMES = [
    "Age", "Sex", "Chest Pain Type", "Resting BP", "Cholesterol",
    "Fasting Blood Sugar", "Resting ECG", "Max Heart Rate",
    "Exercise Angina", "Oldpeak", "ST Slope",
]

FEATURE_KEYS = [
    "age", "sex", "chest_pain_type", "resting_bp", "cholesterol",
    "fasting_blood_sugar", "resting_ecg", "max_heart_rate",
    "exercise_angina", "oldpeak", "st_slope",
]

# Initialise SQLite database on startup
db.init_db()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def compute_feature_importance(features: list[float]) -> list[float]:
    """
    Perturbation-based local feature importance.
    For each feature, nudge it by ±10 % (min 0.5) and measure how the
    predicted probability of heart-attack risk changes.
    Works with any sklearn model (including StackingClassifier).
    """
    scaled = scaler.transform([features])
    base_prob = float(model.predict_proba(scaled)[0][1])

    importances = []
    for i in range(len(features)):
        perturbed = list(features)
        delta = max(abs(features[i] * 0.10), 0.5)
        perturbed[i] += delta
        p = float(model.predict_proba(scaler.transform([perturbed]))[0][1])
        importances.append(p - base_prob)

    return importances


def generate_recommendations(prediction: int, top_features: list[dict], inputs: dict) -> list[dict]:
    """
    Generate dynamic, patient-specific recommendations.
    Each recommendation is a dict with: type, icon, title, detail, metric, reference.
    """
    recs = []
    is_high = prediction == 1
    feature_set = {f["name"] for f in top_features[:5]}

    age = inputs.get("age", 0)
    sex = inputs.get("sex", 0)
    bp = inputs.get("resting_bp", 0)
    chol = inputs.get("cholesterol", 0)
    fbs = inputs.get("fasting_blood_sugar", 0)
    ecg = inputs.get("resting_ecg", 0)
    hr = inputs.get("max_heart_rate", 0)
    angina = inputs.get("exercise_angina", 0)
    oldpeak = inputs.get("oldpeak", 0)
    st_slope = inputs.get("st_slope", 0)
    cp = inputs.get("chest_pain_type", 0)

    predicted_max_hr = 220 - age

    # ── Blood Pressure ────────────────────────────────────
    bp_is_top = "Resting BP" in feature_set
    if bp >= 180:
        recs.append({
            "type": "critical", "icon": "🫀",
            "title": "Hypertensive Crisis",
            "detail": f"Your resting BP of {int(bp)} mm Hg is dangerously elevated. "
                       "This requires urgent medical intervention. "
                       "Seek immediate cardiologist referral for antihypertensive therapy.",
            "metric": f"{int(bp)} mm Hg", "reference": "Normal: <120 mm Hg",
        })
    elif bp >= 140:
        recs.append({
            "type": "critical" if bp_is_top else "warning", "icon": "💉",
            "title": "Stage 2 Hypertension" if bp >= 160 else "Stage 1 Hypertension",
            "detail": f"Your resting BP of {int(bp)} mm Hg exceeds the healthy range. "
                       "Lifestyle modifications combined with medication may be necessary. "
                       "Reduce sodium intake and monitor BP daily.",
            "metric": f"{int(bp)} mm Hg", "reference": "Normal: <120 mm Hg",
        })
    elif bp >= 120:
        recs.append({
            "type": "warning", "icon": "📊",
            "title": "Elevated Blood Pressure",
            "detail": f"Your resting BP of {int(bp)} mm Hg is slightly above normal. "
                       "This is pre-hypertension territory. Adopt a DASH diet, reduce sodium, "
                       "and increase physical activity to prevent progression.",
            "metric": f"{int(bp)} mm Hg", "reference": "Normal: <120 mm Hg",
        })
    else:
        recs.append({
            "type": "positive", "icon": "✅",
            "title": "Healthy Blood Pressure",
            "detail": f"Your resting BP of {int(bp)} mm Hg is within the optimal range. "
                       "Continue your current lifestyle to maintain this.",
            "metric": f"{int(bp)} mm Hg", "reference": "Normal: <120 mm Hg",
        })

    # ── Cholesterol ───────────────────────────────────────
    chol_is_top = "Cholesterol" in feature_set
    if chol >= 300:
        recs.append({
            "type": "critical", "icon": "🩸",
            "title": "Severely High Cholesterol",
            "detail": f"Your cholesterol of {int(chol)} mg/dL is critically elevated. "
                       "This dramatically increases risk of arterial plaque buildup. "
                       "Statin therapy and a strict low-fat, plant-based diet are strongly recommended.",
            "metric": f"{int(chol)} mg/dL", "reference": "Normal: <200 mg/dL",
        })
    elif chol >= 240:
        recs.append({
            "type": "critical" if chol_is_top else "warning", "icon": "🩸",
            "title": "High Cholesterol",
            "detail": f"Your cholesterol of {int(chol)} mg/dL is above the desirable range. "
                       "Consider dietary changes — increase fiber, reduce saturated fats, "
                       "and add omega-3 fatty acids. Medication may be warranted.",
            "metric": f"{int(chol)} mg/dL", "reference": "Normal: <200 mg/dL",
        })
    elif chol >= 200:
        recs.append({
            "type": "warning", "icon": "📋",
            "title": "Borderline High Cholesterol",
            "detail": f"Your cholesterol of {int(chol)} mg/dL is in the borderline range. "
                       "Increase intake of fruits, vegetables, and whole grains. "
                       "Regular monitoring every 6 months is advised.",
            "metric": f"{int(chol)} mg/dL", "reference": "Normal: <200 mg/dL",
        })
    else:
        recs.append({
            "type": "positive", "icon": "✅",
            "title": "Cholesterol Within Range",
            "detail": f"Your cholesterol of {int(chol)} mg/dL is within healthy limits. "
                       "Maintain a balanced diet rich in omega-3 to keep it this way.",
            "metric": f"{int(chol)} mg/dL", "reference": "Normal: <200 mg/dL",
        })

    # ── Max Heart Rate (age-adjusted) ─────────────────────
    hr_is_top = "Max Heart Rate" in feature_set
    hr_ratio = hr / predicted_max_hr if predicted_max_hr > 0 else 0
    if hr_ratio < 0.60:
        recs.append({
            "type": "critical" if hr_is_top else "warning", "icon": "💓",
            "title": "Significantly Reduced Exercise Capacity",
            "detail": f"Your max heart rate of {int(hr)} bpm is only {hr_ratio*100:.0f}% of the "
                       f"age-predicted maximum ({int(predicted_max_hr)} bpm). "
                       "This indicates potential cardiac dysfunction. "
                       "A supervised exercise stress test is recommended.",
            "metric": f"{int(hr)} bpm", "reference": f"Expected: ~{int(predicted_max_hr)} bpm",
        })
    elif hr_ratio < 0.75:
        recs.append({
            "type": "warning", "icon": "💓",
            "title": "Below-Average Exercise Capacity",
            "detail": f"Your max heart rate of {int(hr)} bpm is {hr_ratio*100:.0f}% of the "
                       f"age-predicted maximum ({int(predicted_max_hr)} bpm). "
                       "Gradually increase cardiovascular activity under medical guidance.",
            "metric": f"{int(hr)} bpm", "reference": f"Expected: ~{int(predicted_max_hr)} bpm",
        })
    else:
        recs.append({
            "type": "positive", "icon": "✅",
            "title": "Good Exercise Capacity",
            "detail": f"Your max heart rate of {int(hr)} bpm is {hr_ratio*100:.0f}% of the "
                       f"age-predicted maximum ({int(predicted_max_hr)} bpm), which is healthy.",
            "metric": f"{int(hr)} bpm", "reference": f"Expected: ~{int(predicted_max_hr)} bpm",
        })

    # ── Oldpeak (ST Depression) ───────────────────────────
    op_is_top = "Oldpeak" in feature_set or "ST Slope" in feature_set
    if oldpeak > 2.0:
        recs.append({
            "type": "critical", "icon": "📉",
            "title": "Significant ST Depression",
            "detail": f"An oldpeak of {oldpeak:.1f} suggests significant myocardial ischemia. "
                       "This is a strong indicator of reduced blood flow to the heart. "
                       "Stress echocardiography or coronary angiography is strongly recommended.",
            "metric": f"{oldpeak:.1f}", "reference": "Normal: <1.0",
        })
    elif oldpeak >= 1.0:
        recs.append({
            "type": "warning", "icon": "📉",
            "title": "Mild ST Depression",
            "detail": f"An oldpeak of {oldpeak:.1f} indicates mild ischemic changes. "
                       "Further cardiac evaluation may be warranted, especially with other risk factors.",
            "metric": f"{oldpeak:.1f}", "reference": "Normal: <1.0",
        })
    else:
        recs.append({
            "type": "positive", "icon": "✅",
            "title": "Normal ST Segment",
            "detail": f"Your oldpeak of {oldpeak:.1f} is within normal range, "
                       "suggesting no significant ischemic changes.",
            "metric": f"{oldpeak:.1f}", "reference": "Normal: <1.0",
        })

    # ── Fasting Blood Sugar ───────────────────────────────
    if fbs == 1:
        recs.append({
            "type": "warning", "icon": "🍬",
            "title": "Elevated Fasting Blood Sugar",
            "detail": "Fasting blood sugar exceeds 120 mg/dL, indicating possible "
                       "diabetes or pre-diabetic condition. Uncontrolled blood sugar "
                       "accelerates cardiovascular damage. Consult an endocrinologist.",
            "metric": ">120 mg/dL", "reference": "Normal: <120 mg/dL",
        })
    else:
        recs.append({
            "type": "positive", "icon": "✅",
            "title": "Normal Blood Sugar",
            "detail": "Your fasting blood sugar is within the normal range, "
                       "reducing one key cardiovascular risk factor.",
            "metric": "≤120 mg/dL", "reference": "Normal: <120 mg/dL",
        })

    # ── Exercise Angina ───────────────────────────────────
    if angina == 1:
        recs.append({
            "type": "critical" if is_high else "warning", "icon": "🚨",
            "title": "Exercise-Induced Angina Present",
            "detail": "Chest pain during physical activity suggests inadequate blood "
                       "supply to the heart muscle during exertion. "
                       "Avoid strenuous activity and schedule a cardiac stress test immediately.",
            "metric": "Present", "reference": "Normal: Absent",
        })

    # ── Chest Pain Type ───────────────────────────────────
    cp_is_top = "Chest Pain Type" in feature_set
    if cp == 3:  # Asymptomatic
        if is_high:
            recs.append({
                "type": "warning", "icon": "🫁",
                "title": "Asymptomatic Presentation — Silent Risk",
                "detail": "Despite being classified as asymptomatic, the AI model detected "
                           "elevated risk. Silent heart disease can be particularly dangerous "
                           "as it progresses without obvious symptoms. Regular screening is critical.",
                "metric": "Asymptomatic", "reference": "Chest Pain Type",
            })
    elif cp == 0:  # Typical angina
        recs.append({
            "type": "critical" if cp_is_top else "warning", "icon": "🫁",
            "title": "Typical Angina Reported",
            "detail": "Typical angina pattern — substernal chest discomfort provoked by exertion "
                       "and relieved by rest/nitroglycerin. This strongly correlates with coronary "
                       "artery disease. Cardiology consultation recommended.",
            "metric": "Typical Angina", "reference": "Chest Pain Type",
        })

    # ── ST Slope ──────────────────────────────────────────
    if st_slope == 2:  # Downsloping
        recs.append({
            "type": "critical" if op_is_top else "warning", "icon": "📈",
            "title": "Downsloping ST Segment",
            "detail": "A downsloping ST segment is the most concerning pattern and is "
                       "strongly associated with significant coronary artery disease. "
                       "Immediate further investigation via angiography is recommended.",
            "metric": "Downsloping", "reference": "Normal: Upsloping",
        })
    elif st_slope == 1:  # Flat
        recs.append({
            "type": "warning", "icon": "📈",
            "title": "Flat ST Segment",
            "detail": "A flat ST segment may indicate possible ischemia. "
                       "Combined with other factors, this warrants monitoring.",
            "metric": "Flat", "reference": "Normal: Upsloping",
        })

    # ── Resting ECG ───────────────────────────────────────
    if ecg == 1:
        recs.append({
            "type": "warning", "icon": "📟",
            "title": "ST-T Wave Abnormality",
            "detail": "Resting ECG shows ST-T wave abnormalities, which may indicate "
                       "myocardial strain or ischemia. A follow-up 12-lead ECG and "
                       "echocardiogram are recommended.",
            "metric": "ST-T Abnormality", "reference": "Normal: Normal ECG",
        })
    elif ecg == 2:
        recs.append({
            "type": "warning", "icon": "📟",
            "title": "Left Ventricular Hypertrophy",
            "detail": "Resting ECG suggests left ventricular hypertrophy (LVH), "
                       "often caused by chronic hypertension. An echocardiogram is "
                       "recommended to assess heart chamber size.",
            "metric": "LV Hypertrophy", "reference": "Normal: Normal ECG",
        })

    # ── Age & Sex Context ─────────────────────────────────
    if age >= 60:
        recs.append({
            "type": "tip", "icon": "👤",
            "title": f"Age-Related Risk Factor (Age {int(age)})",
            "detail": "Cardiovascular risk increases significantly after age 60. "
                       "Bi-annual cardiac screenings, regular lipid panels, and proactive "
                       "monitoring of BP and blood sugar are essential.",
            "metric": f"Age {int(age)}", "reference": "Higher risk: >60",
        })
    elif age >= 45:
        recs.append({
            "type": "tip", "icon": "👤",
            "title": f"Mid-Life Cardiovascular Awareness (Age {int(age)})",
            "detail": "Risk begins to rise after age 45. Annual check-ups with "
                       "comprehensive cardiac panels are recommended.",
            "metric": f"Age {int(age)}", "reference": "Moderate risk: 45-60",
        })

    if sex == 1 and age >= 45:
        recs.append({
            "type": "tip", "icon": "♂️",
            "title": "Male Gender Risk Factor",
            "detail": "Males have a statistically higher risk of heart disease, "
                       "especially after age 45. Proactive screening is recommended.",
            "metric": "Male", "reference": "Higher baseline risk",
        })

    # ── Compound Risk Detection ───────────────────────────
    high_bp = bp >= 140
    high_chol = chol >= 240
    has_diabetes = fbs == 1
    risk_count = sum([high_bp, high_chol, has_diabetes])

    if risk_count >= 2:
        combo_parts = []
        if high_bp: combo_parts.append(f"hypertension ({int(bp)} mm Hg)")
        if high_chol: combo_parts.append(f"high cholesterol ({int(chol)} mg/dL)")
        if has_diabetes: combo_parts.append("elevated blood sugar")
        recs.append({
            "type": "critical", "icon": "⚡",
            "title": "Multiple Risk Factors — Compounded Risk",
            "detail": f"This patient presents with {', '.join(combo_parts)}. "
                       "The combination of multiple risk factors multiplies cardiovascular "
                       "risk significantly. A comprehensive treatment plan addressing all "
                       "factors simultaneously is critical.",
            "metric": f"{risk_count} factors", "reference": "Target: 0",
        })

    # ── General Lifestyle Tips ────────────────────────────
    if is_high:
        recs.append({
            "type": "tip", "icon": "🏥",
            "title": "Follow-Up Schedule",
            "detail": "Given the elevated risk level, cardiovascular check-ups every "
                       "3-6 months are recommended. Include lipid panel, BP monitoring, "
                       "and stress testing in each visit.",
            "metric": "Every 3-6 months", "reference": "Standard: Annual",
        })
        recs.append({
            "type": "tip", "icon": "🚭",
            "title": "Lifestyle Modifications",
            "detail": "Smoking cessation, stress management (meditation, yoga), "
                       "and maintaining a healthy BMI through balanced nutrition and "
                       "150 minutes/week of moderate exercise are essential.",
            "metric": "High Priority", "reference": "Lifestyle",
        })
    else:
        recs.append({
            "type": "tip", "icon": "🏃",
            "title": "Maintain Active Lifestyle",
            "detail": "Your overall risk is low. Continue with regular physical activity "
                       "— aim for at least 150 minutes of moderate aerobic exercise per week "
                       "to keep your cardiovascular system in top shape.",
            "metric": "150 min/week", "reference": "WHO Guideline",
        })
        recs.append({
            "type": "tip", "icon": "📅",
            "title": "Annual Cardiac Screening",
            "detail": "Even with low risk, annual cardiovascular screenings including "
                       "lipid panel, BP check, and fasting glucose help catch early changes.",
            "metric": "Once/year", "reference": "Preventive Care",
        })

    # Sort: critical first, then warning, positive, tip
    priority = {"critical": 0, "warning": 1, "positive": 2, "tip": 3}
    recs.sort(key=lambda r: priority.get(r["type"], 9))

    return recs


def pdf_safe(text):
    """Make text safe for fpdf2 built-in (latin-1) fonts."""
    replacements = {
        "\u2014": "-", "\u2013": "-", "\u2019": "'", "\u2018": "'",
        "\u201c": '"', "\u201d": '"', "\u2022": "-", "\u2026": "...",
        "\u00e2\u20ac\u201c": "-",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text.encode("latin-1", "ignore").decode("latin-1")


class ReportPDF(FPDF):
    """Custom PDF for the patient risk report."""

    def header(self):
        self.set_font("Helvetica", "B", 18)
        self.set_text_color(26, 35, 126)  # navy
        self.cell(0, 12, "Heart Attack Risk Assessment Report", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "", 9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 6, "AI-Powered Clinical Decision Support System", new_x="LMARGIN", new_y="NEXT", align="C")
        self.line(10, self.get_y() + 2, 200, self.get_y() + 2)
        self.ln(8)

    def footer(self):
        self.set_y(-20)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(160, 160, 160)
        self.cell(0, 5, pdf_safe("This report is generated by an AI model and is intended to assist - not replace - clinical judgement."), new_x="LMARGIN", new_y="NEXT", align="C")
        self.cell(0, 5, pdf_safe(f"Page {self.page_no()}  |  Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}"), new_x="LMARGIN", new_y="NEXT", align="C")

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    data = request.json
    patient_name = data.get("patient_name", "Unknown Patient").strip()
    if not patient_name:
        patient_name = "Unknown Patient"

    features = [float(data[k]) for k in FEATURE_KEYS]

    # Predict
    scaled_input = scaler.transform([features])
    pred = int(model.predict(scaled_input)[0])
    proba = model.predict_proba(scaled_input)[0]
    risk_prob = float(proba[1])
    confidence = float(max(proba))

    # Feature importance
    importances = compute_feature_importance(features)
    indexed = sorted(
        enumerate(importances), key=lambda x: abs(x[1]), reverse=True
    )
    top_features = [
        {"name": FEATURE_NAMES[i], "importance": round(imp, 4)}
        for i, imp in indexed[:5]
    ]
    all_importances = [
        {"name": FEATURE_NAMES[i], "importance": round(importances[i], 4)}
        for i in range(len(FEATURE_NAMES))
    ]

    # Recommendations
    inputs_dict = dict(zip(FEATURE_KEYS, features))
    recommendations = generate_recommendations(pred, top_features, inputs_dict)

    result = {
        "prediction": "High Risk" if pred == 1 else "Low Risk",
        "probability": round(risk_prob, 4),
        "confidence": round(confidence, 4),
        "top_features": top_features,
        "all_importances": all_importances,
        "recommendations": recommendations,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Save to database (skip What-If analysis requests)
    if patient_name != "__whatif__":
        try:
            record_id = db.save_prediction(patient_name, inputs_dict, result)
            result["record_id"] = record_id
            result["patient_name"] = patient_name
        except Exception as e:
            print(f"[DB] Failed to save prediction: {e}")

    return jsonify(result)


@app.route("/history")
def history():
    """
    Paginated, filterable prediction history.
    Query params: page, per_page, search, date_from, date_to, sort
    """
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 15, type=int)
    search = request.args.get("search", "", type=str).strip()
    date_from = request.args.get("date_from", "", type=str).strip()
    date_to = request.args.get("date_to", "", type=str).strip()
    sort_order = request.args.get("sort", "desc", type=str).strip()

    # Clamp per_page
    per_page = max(5, min(per_page, 100))

    try:
        records = db.get_predictions(
            page=page,
            per_page=per_page,
            search=search,
            date_from=date_from,
            date_to=date_to,
            sort_order=sort_order,
        )
        total = db.get_prediction_count(
            search=search,
            date_from=date_from,
            date_to=date_to,
        )
        total_pages = max(1, math.ceil(total / per_page))

        return jsonify({
            "records": records,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        })
    except Exception as e:
        print(f"[DB] History query failed: {e}")
        return jsonify({"records": [], "total": 0, "page": 1, "per_page": per_page, "total_pages": 1})


@app.route("/history/stats")
def history_stats():
    """Return total record count for the dashboard card."""
    try:
        total = db.get_total_count()
        return jsonify({"total": total})
    except Exception as e:
        print(f"[DB] Stats query failed: {e}")
        return jsonify({"total": 0})


@app.route("/history/<int:record_id>")
def history_detail(record_id):
    """
    Fetch a past record and re-run prediction to get full results
    (feature importance, dynamic recommendations) for display.
    """
    try:
        record = db.get_prediction_by_id(record_id)
        if not record:
            return jsonify({"error": "Record not found"}), 404

        # Reconstruct input features from stored record
        features = [float(record[k]) for k in FEATURE_KEYS]
        inputs_dict = dict(zip(FEATURE_KEYS, features))

        # Re-run model for feature importance + recommendations
        scaled_input = scaler.transform([features])
        pred = int(model.predict(scaled_input)[0])
        proba = model.predict_proba(scaled_input)[0]
        risk_prob = float(proba[1])
        confidence = float(max(proba))

        importances = compute_feature_importance(features)
        indexed = sorted(
            enumerate(importances), key=lambda x: abs(x[1]), reverse=True
        )
        top_features = [
            {"name": FEATURE_NAMES[i], "importance": round(imp, 4)}
            for i, imp in indexed[:5]
        ]
        all_importances = [
            {"name": FEATURE_NAMES[i], "importance": round(importances[i], 4)}
            for i in range(len(FEATURE_NAMES))
        ]

        recommendations = generate_recommendations(pred, top_features, inputs_dict)

        return jsonify({
            "record_id": record["id"],
            "patient_name": record["patient_name"],
            "created_at": record["created_at"],
            "inputs": inputs_dict,
            "prediction": "High Risk" if pred == 1 else "Low Risk",
            "probability": round(risk_prob, 4),
            "confidence": round(confidence, 4),
            "top_features": top_features,
            "all_importances": all_importances,
            "recommendations": recommendations,
            "timestamp": record["created_at"],
        })

    except Exception as e:
        print(f"[DB] History detail failed: {e}")
        return jsonify({"error": "Failed to load record"}), 500



@app.route("/report", methods=["POST"])
def report():
    """Generate a downloadable PDF risk report."""
    data = request.json
    inputs = data.get("inputs", {})
    result = data.get("result", {})

    pdf = ReportPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=25)

    # --- Patient Details ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 10, "Patient Details", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)

    # Patient name
    patient_name = data.get("patient_name", "N/A")
    pdf.cell(60, 7, "Patient Name:", new_x="RIGHT")
    pdf.cell(0, 7, str(patient_name), new_x="LMARGIN", new_y="NEXT")

    labels_map = dict(zip(FEATURE_KEYS, FEATURE_NAMES))
    for key in FEATURE_KEYS:
        val = inputs.get(key, "N/A")
        pdf.cell(60, 7, f"{labels_map[key]}:", new_x="RIGHT")
        pdf.cell(0, 7, str(val), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Risk Assessment ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 10, "Risk Assessment", new_x="LMARGIN", new_y="NEXT")

    pred_text = result.get("prediction", "N/A")
    prob = result.get("probability", 0)
    conf = result.get("confidence", 0)

    if pred_text == "High Risk":
        pdf.set_text_color(211, 47, 47)
    else:
        pdf.set_text_color(56, 142, 60)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, f"Result: {pred_text}", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(60, 60, 60)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, f"Risk Probability: {prob * 100:.1f}%", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Model Confidence: {conf * 100:.1f}%", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Top Contributing Factors ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 10, "Top Contributing Factors", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    for feat in result.get("top_features", []):
        direction = "increases" if feat["importance"] > 0 else "decreases"
        pdf.cell(0, 7, f"  - {feat['name']} - {direction} risk by {abs(feat['importance']) * 100:.1f}%", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # --- Recommendations ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 10, "Personalized Recommendations", new_x="LMARGIN", new_y="NEXT")

    type_labels = {"critical": "CRITICAL", "warning": "WARNING", "positive": "GOOD", "tip": "TIP"}
    type_colors = {
        "critical": (211, 47, 47), "warning": (234, 88, 12),
        "positive": (22, 163, 74), "tip": (37, 99, 235),
    }

    for rec in result.get("recommendations", []):
        # Handle both old plain-string format and new dict format
        if isinstance(rec, str):
            clean = pdf_safe(rec).strip()
            if clean:
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(60, 60, 60)
                pdf.set_x(10)
                pdf.multi_cell(w=190, h=7, text=f"  {clean}", new_x="LMARGIN", new_y="NEXT")
            continue

        rec_type = rec.get("type", "tip")
        color = type_colors.get(rec_type, (60, 60, 60))
        label = type_labels.get(rec_type, "INFO")

        # Title with urgency label
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_text_color(*color)
        title_text = pdf_safe(f"[{label}] {rec.get('title', '')}")
        pdf.cell(0, 7, f"  {title_text}", new_x="LMARGIN", new_y="NEXT")

        # Detail
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(80, 80, 80)
        detail_text = pdf_safe(rec.get("detail", ""))
        if detail_text:
            pdf.set_x(14)
            pdf.multi_cell(w=182, h=6, text=detail_text, new_x="LMARGIN", new_y="NEXT")

        # Metric vs Reference
        metric = rec.get("metric", "")
        reference = rec.get("reference", "")
        if metric and reference:
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_text_color(120, 120, 120)
            pdf.cell(0, 5, f"    Patient: {pdf_safe(metric)}  |  {pdf_safe(reference)}", new_x="LMARGIN", new_y="NEXT")

        pdf.ln(2)

    pdf.ln(2)

    # --- Model Info ---
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 10, "Model Information", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(60, 60, 60)
    for line in [
        "Algorithm: Stacking Ensemble Classifier",
        "Accuracy: 93.7%",
        "ROC-AUC: 0.97",
        "F1 Score: 0.94",
        "Cross-Validation: 91.65%",
    ]:
        pdf.cell(0, 7, f"  {line}", new_x="LMARGIN", new_y="NEXT")

    # Output to temp file (more reliable than BytesIO with fpdf2)
    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    tmp_path = tmp.name
    tmp.close()
    pdf.output(tmp_path)
    response = send_file(
        tmp_path,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"Heart_Risk_Report.pdf",
    )
    # Clean up after response is sent
    @response.call_on_close
    def cleanup():
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
    return response


if __name__ == "__main__":
    app.run(debug=True, port=5000)
