/**
 * CardioAI — Interactive Sidebar Dashboard
 * Section navigation with re-triggered animations, heartbeat loading,
 * toast notifications, animated gauges, what-if analysis,
 * and persistent SQLite-backed patient history with filtering/pagination.
 * 
 * v2 — Interactive Dashboard: ECG monitor, donut chart, live clock,
 *       health tips carousel, animated stats, recent assessments.
 */
(function () {
"use strict";

const KEYS = ["age","sex","chest_pain_type","resting_bp","cholesterol",
    "fasting_blood_sugar","resting_ecg","max_heart_rate",
    "exercise_angina","oldpeak","st_slope"];
const LABELS = {age:"Age",sex:"Sex",chest_pain_type:"Chest Pain Type",
    resting_bp:"Resting BP",cholesterol:"Cholesterol",
    fasting_blood_sugar:"Fasting Blood Sugar",resting_ecg:"Resting ECG",
    max_heart_rate:"Max Heart Rate",exercise_angina:"Exercise Angina",
    oldpeak:"Oldpeak",st_slope:"ST Slope"};
const VAL = {age:{min:1,max:120},resting_bp:{min:50,max:250},cholesterol:{min:50,max:600},max_heart_rate:{min:50,max:250},oldpeak:{min:-5,max:10}};

/* ── Clinical Range Validation Rules ──────────────────── */
const VALIDATION_RULES = {
    age:            { min: 1,  max: 120, msg: 'Please enter a valid age (1–120)' },
    resting_bp:     { min: 50, max: 250, msg: 'Please enter a valid BP (50–250 mm Hg)' },
    cholesterol:    { min: 50, max: 600, msg: 'Please enter valid cholesterol (50–600 mg/dL)' },
    max_heart_rate: { min: 50, max: 250, msg: 'Please enter a valid heart rate (50–250 bpm)' },
    oldpeak:        { min: -5, max: 10,  msg: 'Please enter a valid Oldpeak (-5.0 to 10.0)' }
};

/* ── Inline Validation Helpers ───────────────────────── */
function getOrCreateErrorSpan(inputEl) {
    let span = inputEl.parentElement.querySelector('.field-error');
    if (!span) {
        span = document.createElement('span');
        span.className = 'field-error';
        inputEl.parentElement.appendChild(span);
    }
    return span;
}

function validateField(inputEl, rules) {
    const span = getOrCreateErrorSpan(inputEl);
    const raw = inputEl.value.trim();
    if (raw === '') {
        inputEl.classList.remove('invalid', 'valid');
        span.classList.remove('visible');
        span.textContent = '';
        return true;
    }
    const v = parseFloat(raw);
    if (isNaN(v) || v < rules.min || v > rules.max) {
        inputEl.classList.add('invalid');
        inputEl.classList.remove('valid');
        span.textContent = rules.msg;
        span.classList.add('visible');
        return false;
    } else {
        inputEl.classList.remove('invalid');
        inputEl.classList.add('valid');
        span.classList.remove('visible');
        span.textContent = '';
        return true;
    }
}

/* Attach real-time validation to Patient Form numeric inputs */
function attachFormValidation() {
    Object.keys(VALIDATION_RULES).forEach(key => {
        const el = document.getElementById(key);
        if (!el) return;
        const rules = VALIDATION_RULES[key];
        el.addEventListener('input', () => validateField(el, rules));
        el.addEventListener('blur', () => validateField(el, rules));
    });
}
attachFormValidation();
const WI = {
    age:{t:"number",min:1,max:120,s:1},sex:{t:"select",o:[["0","Female"],["1","Male"]]},
    chest_pain_type:{t:"select",o:[["0","Typical"],["1","Atypical"],["2","Non-anginal"],["3","Asymptomatic"]]},
    resting_bp:{t:"number",min:50,max:250,s:1},cholesterol:{t:"number",min:50,max:600,s:1},
    fasting_blood_sugar:{t:"select",o:[["0","No"],["1","Yes"]]},
    resting_ecg:{t:"select",o:[["0","Normal"],["1","ST-T Abn"],["2","LV Hyp"]]},
    max_heart_rate:{t:"number",min:50,max:250,s:1},exercise_angina:{t:"select",o:[["0","No"],["1","Yes"]]},
    oldpeak:{t:"number",min:-5,max:10,s:0.1},st_slope:{t:"select",o:[["0","Upsloping"],["1","Flat"],["2","Downsloping"]]}
};

let currentResult = null, currentInputs = null, currentPatientName = null, whatifTimer = null;
let selectedPatientRecord = null; // Persists selected patient across Dashboard

/* ── History filter state ───────────────────────────── */
let historyState = {
    page: 1,
    perPage: 15,
    search: "",
    dateFrom: "",
    dateTo: "",
    sort: "desc",
    preset: "all",
};

/* ── Section Navigation ─────────────────────────────── */
const sections = {
    "dashboard":    document.getElementById("sectionDashboard"),
    "patient-form": document.getElementById("sectionPatientForm"),
    "results":      document.getElementById("sectionResults"),
    "history":      document.getElementById("sectionHistory")
};
const navItems = document.querySelectorAll(".nav-item[data-section]");
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");

window.navigateTo = function(id) {
    // Hide all sections
    Object.values(sections).forEach(s => s.classList.remove("active"));
    navItems.forEach(n => n.classList.remove("active"));

    // Show target
    if (sections[id]) {
        sections[id].classList.add("active");
        // Re-trigger entrance animations
        sections[id].querySelectorAll(".animate-in").forEach(el => {
            el.style.animation = "none";
            el.offsetHeight; // force reflow
            el.style.animation = "";
        });
    }

    const nav = document.querySelector(`.nav-item[data-section="${id}"]`);
    if (nav) nav.classList.add("active");

    if (id === "history") loadHistory();
    if (id === "dashboard") { loadDashboardStats(); syncDashboardToPatient(); }
    closeMobile();
    window.scrollTo({top: 0, behavior: "smooth"});
};

navItems.forEach(n => n.addEventListener("click", e => {
    e.preventDefault();
    navigateTo(n.dataset.section);
}));

/* Mobile sidebar */
function closeMobile() { sidebar.classList.remove("open"); overlay.classList.add("hidden"); }
document.getElementById("menuToggle").addEventListener("click", () => {
    sidebar.classList.toggle("open"); overlay.classList.toggle("hidden");
});
overlay.addEventListener("click", closeMobile);

/* ── Toast ───────────────────────────────────────────── */
function showToast(msg, duration) {
    const t = document.getElementById("toast");
    document.getElementById("toastMsg").textContent = msg;
    t.classList.remove("hidden");
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 350); }, duration || 2500);
}

/* ── Validation ──────────────────────────────────────── */
function validate() {
    let ok = true;
    // Validate patient name
    const nameEl = document.getElementById("patient_name");
    nameEl.classList.remove("invalid");
    if (!nameEl.value.trim()) { nameEl.classList.add("invalid"); ok = false; }

    KEYS.forEach(k => {
        const el = document.getElementById(k);
        el.classList.remove("invalid");
        if (el.value === "") { el.classList.add("invalid"); ok = false; return; }
        if (VAL[k]) { const v = parseFloat(el.value); if (isNaN(v)||v<VAL[k].min||v>VAL[k].max) { el.classList.add("invalid"); ok = false; } }
    });
    if (!ok) showToast("⚠️ Please fill in all fields correctly");
    return ok;
}
function getData() { const d={}; KEYS.forEach(k=>d[k]=parseFloat(document.getElementById(k).value)); return d; }

/* ── Predict API ─────────────────────────────────────── */
async function predict(data) {
    const r = await fetch("/predict",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    if (!r.ok) throw new Error(); return r.json();
}

/* ── Form Submit ─────────────────────────────────────── */
document.getElementById("predictionForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!validate()) return;
    currentInputs = getData();
    currentPatientName = document.getElementById("patient_name").value.trim();

    // Switch to results, show heartbeat loading
    navigateTo("results");
    document.getElementById("resultsEmpty").classList.add("hidden");
    document.getElementById("resultsContent").classList.add("hidden");
    document.getElementById("resultsLoading").classList.remove("hidden");
    document.getElementById("replayBanner").classList.add("hidden");
    isReplaying = false;

    try {
        const result = await predict({ ...currentInputs, patient_name: currentPatientName });
        currentResult = result;

        // Keep heartbeat for a moment longer for UX
        setTimeout(() => {
            document.getElementById("resultsLoading").classList.add("hidden");
            document.getElementById("resultsContent").classList.remove("hidden");

            // Re-trigger result animations
            document.getElementById("resultsContent").querySelectorAll(".animate-in").forEach(el => {
                el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
            });

            renderResult(result);
            buildWhatIf(currentInputs);
            showToast(result.prediction === "High Risk" ? "🔴 High Risk Detected" : "🟢 Low Risk — Patient is healthy");
        }, 1800);

        // Update dashboard card
        document.getElementById("dashResultText").textContent =
            `${result.prediction} — ${(result.probability*100).toFixed(1)}%`;
    } catch (err) {
        document.getElementById("resultsLoading").classList.add("hidden");
        document.getElementById("resultsEmpty").classList.remove("hidden");
        showToast("❌ Prediction failed. Check server.");
    }
});

/* ── Render Result ───────────────────────────────────── */
function renderResult(r) {
    const high = r.prediction === "High Risk";
    const pct = (r.probability * 100).toFixed(1);

    // Risk badge
    const badge = document.getElementById("riskBadge");
    badge.textContent = r.prediction;
    badge.className = "risk-badge " + (high ? "high" : "low");
    document.getElementById("resultTimestamp").textContent = r.timestamp;

    // SVG gauge
    const circ = 2 * Math.PI * 68;
    const fill = document.getElementById("gaugeFill");
    fill.style.stroke = high ? "var(--red)" : "var(--green)";
    // Reset then animate
    fill.style.transition = "none";
    fill.style.strokeDashoffset = circ;
    fill.offsetHeight;
    fill.style.transition = "stroke-dashoffset 1.4s ease, stroke .4s";
    fill.style.strokeDashoffset = circ * (1 - r.probability);
    animNum(document.getElementById("gaugeValue"), 0, parseFloat(pct), 1200, v => v.toFixed(1) + "%");

    // Confidence
    const confPct = (r.confidence * 100).toFixed(1);
    document.getElementById("confidenceValue").textContent = confPct + "%";
    const bar = document.getElementById("confBar");
    bar.style.width = "0"; bar.offsetHeight; bar.style.width = confPct + "%";

    // Factors
    renderFactors(r.all_importances, r.top_features);

    // Recommendations (rich cards)
    const recsContainer = document.getElementById("recsList"); recsContainer.innerHTML = "";
    const summaryEl = document.getElementById("recsSummary");
    const recsData = r.recommendations || [];

    // Count by type for summary
    let critCount = 0, warnCount = 0, posCount = 0;
    recsData.forEach(rec => {
        if (typeof rec === 'string') return;
        if (rec.type === 'critical') critCount++;
        else if (rec.type === 'warning') warnCount++;
        else if (rec.type === 'positive') posCount++;
    });

    // Render summary badges
    let summaryHtml = '';
    if (critCount > 0) summaryHtml += `<span class="rec-count-badge rec-count--critical">${critCount} Critical</span>`;
    if (warnCount > 0) summaryHtml += `<span class="rec-count-badge rec-count--warning">${warnCount} Warning</span>`;
    if (posCount > 0) summaryHtml += `<span class="rec-count-badge rec-count--positive">${posCount} Healthy</span>`;
    if (summaryEl) summaryEl.innerHTML = summaryHtml;

    recsData.forEach((rec, idx) => {
        // Backward compat: if rec is a plain string
        if (typeof rec === 'string') {
            const li = document.createElement("div");
            li.className = "rec-card rec-card--tip";
            li.innerHTML = `<div class="rec-card-body"><p class="rec-detail">${escHtml(rec)}</p></div>`;
            recsContainer.appendChild(li);
            return;
        }

        const card = document.createElement("div");
        card.className = `rec-card rec-card--${rec.type || 'tip'}`;
        card.style.animationDelay = `${0.08 * idx}s`;

        const typeLabels = {critical:'CRITICAL',warning:'WARNING',positive:'GOOD',tip:'TIP'};
        const label = typeLabels[rec.type] || 'INFO';

        card.innerHTML = `
            <div class="rec-card-accent"></div>
            <div class="rec-card-body">
                <div class="rec-card-header">
                    <span class="rec-icon">${rec.icon || '💡'}</span>
                    <div class="rec-title-wrap">
                        <span class="rec-type-badge rec-type--${rec.type || 'tip'}">${label}</span>
                        <h4 class="rec-title">${escHtml(rec.title || '')}</h4>
                    </div>
                </div>
                <p class="rec-detail">${escHtml(rec.detail || '')}</p>
                ${rec.metric || rec.reference ? `
                <div class="rec-metrics">
                    ${rec.metric ? `<span class="rec-metric"><strong>Patient:</strong> ${escHtml(rec.metric)}</span>` : ''}
                    ${rec.reference ? `<span class="rec-ref">${escHtml(rec.reference)}</span>` : ''}
                </div>` : ''}
            </div>`;
        recsContainer.appendChild(card);
    });
}

function animNum(el, from, to, dur, fmt) {
    const s = performance.now();
    (function step(now) {
        const t = Math.min((now-s)/dur, 1);
        el.textContent = fmt(from + (to-from) * (1-Math.pow(1-t,3)));
        if (t < 1) requestAnimationFrame(step);
    })(performance.now());
}

function renderFactors(all, top) {
    const list = document.getElementById("factorsList"); list.innerHTML = "";
    const sorted = [...all].sort((a,b) => Math.abs(b.importance)-Math.abs(a.importance));
    const mx = Math.max(...sorted.map(f=>Math.abs(f.importance)), 0.01);

    sorted.forEach((f,i) => {
        const pos = f.importance >= 0;
        const w = (Math.abs(f.importance)/mx*100).toFixed(1);
        const row = document.createElement("div"); row.className = "factor-row";
        row.innerHTML = `<span class="factor-name">${f.name}</span>
            <div class="factor-bar-wrap"><div class="factor-bar ${pos?'positive':'negative'}" style="width:0"></div></div>
            <span class="factor-impact ${pos?'positive':'negative'}">${pos?'+':''}${(f.importance*100).toFixed(1)}%</span>`;
        list.appendChild(row);
        // Staggered bar animation
        setTimeout(() => row.querySelector(".factor-bar").style.width = w+"%", 200 + i*100);
    });

    const t2 = top.slice(0,2).map(f=>f.name);
    document.getElementById("factorsSummary").textContent =
        currentResult.prediction === "High Risk"
            ? `${t2.join(" and ")} significantly increased the predicted risk for this patient.`
            : `${t2.join(" and ")} are the most influential factors. Overall risk remains low.`;
}

/* ── What-If ─────────────────────────────────────────── */
function buildWhatIf(inputs) {
    const wrap = document.getElementById("whatifControls"); wrap.innerHTML = "";
    document.getElementById("whatifResult").classList.add("hidden");
    KEYS.forEach(k => {
        const c = WI[k], g = document.createElement("div"); g.className = "whatif-group";
        const l = document.createElement("label"); l.textContent = LABELS[k]; g.appendChild(l);
        let el;
        if (c.t==="select") {
            el = document.createElement("select");
            c.o.forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;if(parseFloat(v)===inputs[k]) o.selected=true;el.appendChild(o);});
        } else { el = document.createElement("input"); el.type="number"; el.min=c.min; el.max=c.max; el.step=c.s; el.value=inputs[k]; }
        el.dataset.key = k;
        const handler = ()=>{
            // Run inline validation for numeric What-If fields
            if (VALIDATION_RULES[k]) validateField(el, VALIDATION_RULES[k]);
            clearTimeout(whatifTimer); whatifTimer = setTimeout(runWhatIf, 350);
        };
        el.addEventListener("input", handler); el.addEventListener("change", handler);
        // Also validate on blur
        if (VALIDATION_RULES[k]) {
            el.addEventListener("blur", () => validateField(el, VALIDATION_RULES[k]));
        }
        g.appendChild(el); wrap.appendChild(g);
    });
}

async function runWhatIf() {
    const d = {};
    let allValid = true;
    document.getElementById("whatifControls").querySelectorAll("input,select").forEach(el => {
        const key = el.dataset.key;
        d[key] = parseFloat(el.value);
        // Check validity for numeric fields
        if (VALIDATION_RULES[key]) {
            const v = parseFloat(el.value);
            const r = VALIDATION_RULES[key];
            if (el.value.trim() === '' || isNaN(v) || v < r.min || v > r.max) {
                allValid = false;
            }
        }
    });
    // Don't compute risk if any value is out of clinical range
    if (!allValid) {
        document.getElementById("whatifResult").classList.add("hidden");
        return;
    }
    try {
        // Add a dummy patient_name so the predict endpoint works, but mark it
        d.patient_name = "__whatif__";
        const r = await predict(d);
        const orig = currentResult.probability, nw = r.probability, delta = nw - orig;
        document.getElementById("whatifOrigProb").textContent = (orig*100).toFixed(1)+"%";
        document.getElementById("whatifNewProb").textContent = (nw*100).toFixed(1)+"%";
        const dEl = document.getElementById("whatifDelta");
        if (Math.abs(delta)<.001) { dEl.textContent="No change"; dEl.className="wf-delta same"; }
        else if (delta>0) { dEl.textContent="↑ +"+(delta*100).toFixed(1)+"%"; dEl.className="wf-delta up"; }
        else { dEl.textContent="↓ "+(delta*100).toFixed(1)+"%"; dEl.className="wf-delta down"; }
        document.getElementById("whatifResult").classList.remove("hidden");
    } catch(e) { console.error(e); }
}

/* ══════════════════════════════════════════════════════
   INTERACTIVE DASHBOARD FEATURES
   ══════════════════════════════════════════════════════ */

/* ── Live Clock ──────────────────────────────────────── */
function updateClock() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const timeStr = `${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ampm}`;
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dateStr = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
    
    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (timeEl) timeEl.textContent = timeStr;
    if (dateEl) dateEl.textContent = dateStr;
}
updateClock();
setInterval(updateClock, 1000);

/* ── ECG Canvas Monitor ──────────────────────────────── */
const ecgCanvas = document.getElementById('ecgCanvas');
let ecgCtx = null;
let ecgData = [];
const ECG_POINTS = 300;
const ECG_SPEED = 2;
let ecgX = 0;
let ecgAnimId = null;

// Generate a realistic ECG waveform segment
function generateEcgSegment() {
    const segment = [];
    const baseY = 75;
    // P wave
    for (let i = 0; i < 12; i++) segment.push(baseY - 8 * Math.sin(Math.PI * i / 12));
    // PR segment
    for (let i = 0; i < 6; i++) segment.push(baseY);
    // QRS complex
    segment.push(baseY + 5);   // Q
    segment.push(baseY - 55);  // R (tall spike)
    segment.push(baseY + 15);  // S
    // ST segment
    for (let i = 0; i < 8; i++) segment.push(baseY);
    // T wave
    for (let i = 0; i < 16; i++) segment.push(baseY - 12 * Math.sin(Math.PI * i / 16));
    // Baseline
    for (let i = 0; i < 20; i++) segment.push(baseY);
    return segment;
}

function initEcg() {
    if (!ecgCanvas) return;
    ecgCtx = ecgCanvas.getContext('2d');
    // Set actual canvas resolution
    const dpr = window.devicePixelRatio || 1;
    const rect = ecgCanvas.getBoundingClientRect();
    ecgCanvas.width = rect.width * dpr;
    ecgCanvas.height = rect.height * dpr;
    ecgCtx.scale(dpr, dpr);
    
    // Prefill data
    const seg = generateEcgSegment();
    while (ecgData.length < ECG_POINTS) {
        ecgData.push(...seg);
    }
    ecgData = ecgData.slice(0, ECG_POINTS);
    ecgX = 0;
    drawEcg();
}

let ecgSegmentBuffer = [];
let ecgSegmentIndex = 0;

function drawEcg() {
    if (!ecgCtx) return;
    const w = ecgCanvas.getBoundingClientRect().width;
    const h = ecgCanvas.getBoundingClientRect().height;
    
    ecgCtx.clearRect(0, 0, w, h);
    
    // Draw ECG line
    ecgCtx.beginPath();
    ecgCtx.strokeStyle = '#22c55e';
    ecgCtx.lineWidth = 2;
    ecgCtx.shadowColor = '#22c55e';
    ecgCtx.shadowBlur = 6;
    
    const step = w / ECG_POINTS;
    for (let i = 0; i < ecgData.length; i++) {
        const x = i * step;
        const y = ecgData[i];
        if (i === 0) ecgCtx.moveTo(x, y);
        else ecgCtx.lineTo(x, y);
    }
    ecgCtx.stroke();
    ecgCtx.shadowBlur = 0;
    
    // Glow dot at the head
    const headX = (ecgData.length - 1) * step;
    const headY = ecgData[ecgData.length - 1];
    ecgCtx.beginPath();
    ecgCtx.arc(headX, headY, 3, 0, Math.PI * 2);
    ecgCtx.fillStyle = '#22c55e';
    ecgCtx.fill();
    ecgCtx.beginPath();
    ecgCtx.arc(headX, headY, 6, 0, Math.PI * 2);
    ecgCtx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    ecgCtx.fill();
    
    // Shift data and add new points
    if (ecgSegmentBuffer.length === 0) {
        ecgSegmentBuffer = generateEcgSegment();
        ecgSegmentIndex = 0;
        // Vary BPM slightly
        const bpm = 68 + Math.floor(Math.random() * 10);
        const bpmEl = document.getElementById('ecgBpm');
        if (bpmEl) bpmEl.innerHTML = bpm + ' <small>bpm</small>';
        // Vary SpO2
        const spo2 = 96 + Math.floor(Math.random() * 4);
        const spo2El = document.getElementById('ecgSpo2');
        if (spo2El) spo2El.innerHTML = spo2 + '<small>%</small>';
    }
    
    for (let i = 0; i < ECG_SPEED; i++) {
        ecgData.shift();
        if (ecgSegmentIndex < ecgSegmentBuffer.length) {
            // Add slight randomness
            ecgData.push(ecgSegmentBuffer[ecgSegmentIndex] + (Math.random() - 0.5) * 1.5);
            ecgSegmentIndex++;
        } else {
            ecgData.push(75); // baseline
        }
    }
    
    ecgAnimId = requestAnimationFrame(drawEcg);
}

// Initialize ECG when visible
setTimeout(initEcg, 500);
// Re-init on window resize
window.addEventListener('resize', () => {
    if (ecgAnimId) cancelAnimationFrame(ecgAnimId);
    setTimeout(initEcg, 200);
});

/* ── Dashboard Stats ─────────────────────────────────── */
async function loadDashboardStats() {
    try {
        // Fetch all records to compute stats
        const r = await fetch("/history?page=1&per_page=1000&sort=desc");
        const data = await r.json();
        
        const total = data.total || 0;
        let highCount = 0;
        let lowCount = 0;
        let totalProb = 0;
        
        if (data.records && data.records.length > 0) {
            data.records.forEach(rec => {
                if (rec.prediction === "High Risk") highCount++;
                else lowCount++;
                totalProb += rec.probability || 0;
            });
        }
        
        const avgRisk = total > 0 ? (totalProb / total * 100).toFixed(1) : 0;
        
        // Animate stat numbers
        animNum(document.getElementById("statTotalVal"), 0, total, 800, v => Math.round(v).toString());
        animNum(document.getElementById("statHighVal"), 0, highCount, 800, v => Math.round(v).toString());
        animNum(document.getElementById("statLowVal"), 0, lowCount, 800, v => Math.round(v).toString());
        animNum(document.getElementById("statAvgVal"), 0, parseFloat(avgRisk), 800, v => v.toFixed(1) + "%");
        
        document.getElementById("dashHistoryText").textContent = total + " records";
        
        // Update donut chart
        updateDonutChart(highCount, lowCount, total);
        
        // Update recent assessments
        updateRecentList(data.records ? data.records.slice(0, 5) : []);
        
    } catch(e) {
        console.error("Dashboard stats error:", e);
    }
}

/* ── Dashboard Patient Sync ──────────────────────────── */
function syncDashboardToPatient() {
    const banner = document.getElementById("dashPatientBanner");
    const overview = document.getElementById("dashOverview");
    const patientView = document.getElementById("dashPatientView");
    if (!banner || !overview || !patientView) return;

    if (selectedPatientRecord) {
        // Show patient-specific dashboard
        banner.classList.remove("hidden");
        document.getElementById("dpbName").textContent = selectedPatientRecord.patient_name || "Unknown";
        document.getElementById("dpbDate").textContent = selectedPatientRecord.created_at || "—";
        overview.classList.add("hidden");
        patientView.classList.remove("hidden");
        renderPatientDashboard(selectedPatientRecord);
    } else {
        // Show normal overview
        banner.classList.add("hidden");
        overview.classList.remove("hidden");
        patientView.classList.add("hidden");
    }
}

function renderPatientDashboard(data) {
    const high = data.prediction === "High Risk";
    const pct = (data.probability * 100).toFixed(1);
    const confPct = (data.confidence * 100).toFixed(1);

    // Stat cards
    document.getElementById("dpStatName").textContent = data.patient_name || "Unknown";
    const riskEl = document.getElementById("dpStatRisk");
    riskEl.textContent = data.prediction;
    riskEl.style.color = high ? "var(--red)" : "var(--green)";
    document.getElementById("dpStatProb").textContent = pct + "%";
    document.getElementById("dpStatConf").textContent = confPct + "%";

    // Risk gauge
    const circ = 2 * Math.PI * 68;
    const fill = document.getElementById("dpGaugeFill");
    if (fill) {
        fill.style.stroke = high ? "var(--red)" : "var(--green)";
        fill.style.transition = "none";
        fill.style.strokeDashoffset = circ;
        fill.offsetHeight;
        fill.style.transition = "stroke-dashoffset 1.4s ease, stroke .4s";
        fill.style.strokeDashoffset = circ * (1 - data.probability);
    }
    animNum(document.getElementById("dpGaugeValue"), 0, parseFloat(pct), 1200, v => v.toFixed(1) + "%");

    // Assessment date
    document.getElementById("dpAssessDate").textContent = "Assessment: " + (data.created_at || "—");

    // Patient vitals
    const vitalsGrid = document.getElementById("dpVitalsGrid");
    if (vitalsGrid) {
        const inputs = data.inputs || {};
        const sexLabel = inputs.sex == 1 ? "Male" : "Female";
        const cpLabels = {0:"Typical Angina",1:"Atypical Angina",2:"Non-anginal",3:"Asymptomatic"};
        const ecgLabels = {0:"Normal",1:"ST-T Abnormality",2:"LV Hypertrophy"};
        const slopeLabels = {0:"Upsloping",1:"Flat",2:"Downsloping"};

        const vitals = [
            {label:"Age",         value:Math.round(inputs.age || 0) + " yrs",  alert: inputs.age >= 60, ok: inputs.age < 45},
            {label:"Sex",         value:sexLabel},
            {label:"Resting BP",  value:(inputs.resting_bp||0)+" mm Hg",       alert: inputs.resting_bp >= 140, ok: inputs.resting_bp < 120},
            {label:"Cholesterol", value:(inputs.cholesterol||0)+" mg/dL",       alert: inputs.cholesterol >= 240, ok: inputs.cholesterol < 200},
            {label:"Max HR",      value:Math.round(inputs.max_heart_rate||0)+" bpm", alert: inputs.max_heart_rate < (220 - (inputs.age||0)) * 0.6, ok: inputs.max_heart_rate >= (220 - (inputs.age||0)) * 0.75},
            {label:"Oldpeak",     value:(inputs.oldpeak||0).toFixed(1),          alert: inputs.oldpeak > 2.0, ok: inputs.oldpeak < 1.0},
            {label:"Chest Pain",  value:cpLabels[inputs.chest_pain_type] || "—"},
            {label:"Fasting BS",  value:inputs.fasting_blood_sugar == 1 ? ">120 mg/dL" : "Normal", alert: inputs.fasting_blood_sugar == 1, ok: inputs.fasting_blood_sugar == 0},
            {label:"Resting ECG", value:ecgLabels[inputs.resting_ecg] || "—",    alert: inputs.resting_ecg > 0},
            {label:"Ex. Angina",  value:inputs.exercise_angina == 1 ? "Yes" : "No", alert: inputs.exercise_angina == 1, ok: inputs.exercise_angina == 0},
            {label:"ST Slope",    value:slopeLabels[inputs.st_slope] || "—",     alert: inputs.st_slope == 2},
        ];

        vitalsGrid.innerHTML = "";
        vitals.forEach(v => {
            const item = document.createElement("div");
            item.className = "dp-vital-item" + (v.alert ? " dp-vital--alert" : v.ok ? " dp-vital--ok" : "");
            item.innerHTML = `<span class="dp-vital-label">${v.label}</span><span class="dp-vital-value">${v.value}</span>`;
            vitalsGrid.appendChild(item);
        });
    }

    // Contributing factors
    const factorsList = document.getElementById("dpFactorsList");
    if (factorsList && data.all_importances) {
        factorsList.innerHTML = "";
        const sorted = [...data.all_importances].sort((a,b) => Math.abs(b.importance) - Math.abs(a.importance));
        const mx = Math.max(...sorted.map(f => Math.abs(f.importance)), 0.01);
        sorted.forEach((f, i) => {
            const pos = f.importance >= 0;
            const w = (Math.abs(f.importance) / mx * 100).toFixed(1);
            const row = document.createElement("div"); row.className = "factor-row";
            row.innerHTML = `<span class="factor-name">${f.name}</span>
                <div class="factor-bar-wrap"><div class="factor-bar ${pos?'positive':'negative'}" style="width:0"></div></div>
                <span class="factor-impact ${pos?'positive':'negative'}">${pos?'+':''}${(f.importance*100).toFixed(1)}%</span>`;
            factorsList.appendChild(row);
            setTimeout(() => row.querySelector(".factor-bar").style.width = w + "%", 200 + i * 80);
        });
    }

    // Recommendations summary (top 5)
    const recsList = document.getElementById("dpRecsList");
    if (recsList && data.recommendations) {
        recsList.innerHTML = "";
        const topRecs = data.recommendations.slice(0, 6);
        topRecs.forEach(rec => {
            if (typeof rec === 'string') return;
            const item = document.createElement("div");
            item.className = `dp-rec-item dp-rec-item--${rec.type || 'tip'}`;
            item.innerHTML = `<span class="dp-rec-icon">${rec.icon || '💡'}</span>
                <div class="dp-rec-text"><strong>${escHtml(rec.title || '')}</strong><br>${escHtml(rec.detail || '').substring(0, 100)}${(rec.detail||'').length > 100 ? '...' : ''}</div>`;
            recsList.appendChild(item);
        });
    }

    // Re-trigger animations
    document.getElementById("dashPatientView").querySelectorAll(".animate-in").forEach(el => {
        el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
    });
}

function clearPatientSelection() {
    selectedPatientRecord = null;
    syncDashboardToPatient();
    showToast("🔄 Returned to dashboard overview");
}

/* ── Donut Chart ─────────────────────────────────────── */
function updateDonutChart(high, low, total) {
    const circumference = 2 * Math.PI * 60; // 376.99
    const highEl = document.getElementById("donutHigh");
    const lowEl = document.getElementById("donutLow");
    const totalEl = document.getElementById("donutTotal");
    const legendHighEl = document.getElementById("legendHigh");
    const legendLowEl = document.getElementById("legendLow");
    
    if (!highEl || !lowEl) return;
    
    totalEl.textContent = total;
    legendHighEl.textContent = high;
    legendLowEl.textContent = low;
    
    if (total === 0) {
        highEl.style.strokeDashoffset = circumference;
        lowEl.style.strokeDashoffset = circumference;
        return;
    }
    
    const highRatio = high / total;
    const lowRatio = low / total;
    
    // High risk segment
    const highLength = circumference * highRatio;
    highEl.style.strokeDasharray = circumference;
    highEl.style.strokeDashoffset = circumference - highLength;
    
    // Low risk segment — offset by the high segment
    const lowLength = circumference * lowRatio;
    lowEl.style.strokeDasharray = `${lowLength} ${circumference - lowLength}`;
    lowEl.style.strokeDashoffset = -highLength;
}

/* ── Recent Assessments ──────────────────────────────── */
function updateRecentList(records) {
    const list = document.getElementById("recentList");
    if (!list) return;
    
    if (!records || records.length === 0) {
        list.innerHTML = `<div class="recent-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>No assessments yet</span>
        </div>`;
        return;
    }
    
    list.innerHTML = "";
    records.forEach(rec => {
        const isHigh = rec.prediction === "High Risk";
        const initials = (rec.patient_name || "?").split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
        const item = document.createElement("div");
        item.className = "recent-item";
        item.innerHTML = `
            <div class="recent-avatar ${isHigh ? 'recent-avatar--high' : 'recent-avatar--low'}">${initials}</div>
            <div class="recent-info">
                <span class="recent-name">${escHtml(rec.patient_name || 'Unknown')}</span>
                <span class="recent-meta">${rec.created_at || ''} · ${(rec.probability * 100).toFixed(1)}% risk</span>
            </div>
            <span class="tag ${isHigh ? 'tag-high' : 'tag-low'}">${rec.prediction}</span>`;
        list.appendChild(item);
    });
}

/* ── Health Tips Carousel ────────────────────────────── */
let currentTip = 0;
const totalTips = 5;
let tipAutoTimer = null;

function showTip(index, direction) {
    const slides = document.querySelectorAll('.tip-slide');
    const dots = document.querySelectorAll('.tip-dot');
    if (!slides.length) return;
    
    // Clamp index
    if (index < 0) index = totalTips - 1;
    if (index >= totalTips) index = 0;
    
    slides.forEach(s => {
        s.classList.remove('active', 'exit-left');
    });
    dots.forEach(d => d.classList.remove('active'));
    
    slides[index].classList.add('active');
    dots[index].classList.add('active');
    
    const counter = document.getElementById('tipCounter');
    if (counter) counter.textContent = `${index + 1} / ${totalTips}`;
    
    currentTip = index;
}

function nextTip() { showTip(currentTip + 1, 'right'); }
function prevTip() { showTip(currentTip - 1, 'left'); }

// Auto-rotate tips
function startTipAuto() {
    stopTipAuto();
    tipAutoTimer = setInterval(nextTip, 5000);
}
function stopTipAuto() {
    if (tipAutoTimer) clearInterval(tipAutoTimer);
}

const tipPrevBtn = document.getElementById('tipPrev');
const tipNextBtn = document.getElementById('tipNext');
if (tipPrevBtn) tipPrevBtn.addEventListener('click', () => { stopTipAuto(); prevTip(); startTipAuto(); });
if (tipNextBtn) tipNextBtn.addEventListener('click', () => { stopTipAuto(); nextTip(); startTipAuto(); });

// Dot navigation
document.querySelectorAll('.tip-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        stopTipAuto();
        showTip(parseInt(dot.dataset.dot), 'right');
        startTipAuto();
    });
});

startTipAuto();

/* ── History ─────────────────────────────────────────── */

// Date helpers
function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
}
function daysAgo(n) {
    const d = new Date(); d.setDate(d.getDate() - n); return formatDate(d);
}
function today() { return formatDate(new Date()); }

// Compute date range from preset
function applyPreset(preset) {
    historyState.preset = preset;
    switch(preset) {
        case "all":
            historyState.dateFrom = "";
            historyState.dateTo = "";
            break;
        case "today":
            historyState.dateFrom = today();
            historyState.dateTo = today();
            break;
        case "yesterday":
            historyState.dateFrom = daysAgo(1);
            historyState.dateTo = daysAgo(1);
            break;
        case "7days":
            historyState.dateFrom = daysAgo(6);
            historyState.dateTo = today();
            break;
        case "30days":
            historyState.dateFrom = daysAgo(29);
            historyState.dateTo = today();
            break;
        case "custom":
            // Don't change dates, user will pick them
            break;
    }
}

// Preset buttons
document.querySelectorAll(".hf-preset").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".hf-preset").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const preset = btn.dataset.preset;
        const customRange = document.getElementById("customDateRange");

        if (preset === "custom") {
            customRange.classList.remove("hidden");
            return; // wait for Apply button
        } else {
            customRange.classList.add("hidden");
        }

        applyPreset(preset);
        historyState.page = 1;
        loadHistory();
    });
});

// Custom date Apply
document.getElementById("applyCustomDate").addEventListener("click", () => {
    historyState.dateFrom = document.getElementById("historyDateFrom").value || "";
    historyState.dateTo = document.getElementById("historyDateTo").value || "";
    historyState.page = 1;
    loadHistory();
});

// Sort
document.getElementById("historySort").addEventListener("change", (e) => {
    historyState.sort = e.target.value;
    historyState.page = 1;
    loadHistory();
});

// Search (debounced)
let searchTimer = null;
document.getElementById("historySearch").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        historyState.search = e.target.value.trim();
        historyState.page = 1;
        loadHistory();
    }, 400);
});

// Pagination buttons
document.getElementById("pgPrev").addEventListener("click", () => {
    if (historyState.page > 1) {
        historyState.page--;
        loadHistory();
    }
});
document.getElementById("pgNext").addEventListener("click", () => {
    historyState.page++;
    loadHistory();
});

async function loadHistory() {
    const emptyEl = document.getElementById("historyEmpty");
    const cardEl = document.getElementById("historyCard");
    const loadingEl = document.getElementById("historyLoading");

    // Show loading
    emptyEl.classList.add("hidden");
    cardEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");

    try {
        const params = new URLSearchParams({
            page: historyState.page,
            per_page: historyState.perPage,
            sort: historyState.sort,
        });
        if (historyState.search) params.set("search", historyState.search);
        if (historyState.dateFrom) params.set("date_from", historyState.dateFrom);
        if (historyState.dateTo) params.set("date_to", historyState.dateTo);

        const r = await fetch("/history?" + params.toString());
        const data = await r.json();

        loadingEl.classList.add("hidden");

        // Update dashboard
        document.getElementById("dashHistoryText").textContent = data.total + " records";
        document.getElementById("historyCount").textContent =
            data.total === 1 ? "1 record found" : `${data.total} records found`;

        if (!data.records.length) {
            emptyEl.classList.remove("hidden");
            cardEl.classList.add("hidden");
            return;
        }

        emptyEl.classList.add("hidden");
        cardEl.classList.remove("hidden");

        // Render table
        const tb = document.getElementById("historyBody");
        tb.innerHTML = "";
        const offset = (data.page - 1) * data.per_page;

        data.records.forEach((rec, i) => {
            const tr = document.createElement("tr");
            const h = rec.prediction === "High Risk";
            tr.innerHTML = `
                <td>${offset + i + 1}</td>
                <td class="td-patient-name">${escHtml(rec.patient_name)}</td>
                <td>${rec.created_at}</td>
                <td>${rec.age}</td>
                <td>${rec.sex == 1 ? 'M' : 'F'}</td>
                <td><span class="tag ${h ? 'tag-high' : 'tag-low'}">${rec.prediction}</span></td>
                <td>${(rec.probability * 100).toFixed(1)}%</td>
                <td><button class="btn-view-record" data-id="${rec.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    View
                </button></td>`;
            tb.appendChild(tr);
        });

        // Attach click handlers to View buttons
        tb.querySelectorAll(".btn-view-record").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                viewRecord(parseInt(btn.dataset.id));
            });
        });

        // Render pagination
        renderPagination(data.page, data.total_pages);

    } catch(e) {
        console.error(e);
        loadingEl.classList.add("hidden");
        emptyEl.classList.remove("hidden");
    }
}

function renderPagination(current, total) {
    const prevBtn = document.getElementById("pgPrev");
    const nextBtn = document.getElementById("pgNext");
    const numsWrap = document.getElementById("pgNumbers");

    prevBtn.disabled = current <= 1;
    nextBtn.disabled = current >= total;

    numsWrap.innerHTML = "";

    // Generate page numbers with ellipsis
    const pages = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) pages.push(i);
    } else {
        pages.push(1);
        if (current > 3) pages.push("...");
        for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
            pages.push(i);
        }
        if (current < total - 2) pages.push("...");
        pages.push(total);
    }

    pages.forEach(p => {
        if (p === "...") {
            const span = document.createElement("span");
            span.className = "pg-ellipsis";
            span.textContent = "...";
            numsWrap.appendChild(span);
        } else {
            const btn = document.createElement("button");
            btn.className = "pg-num" + (p === current ? " active" : "");
            btn.textContent = p;
            btn.addEventListener("click", () => {
                historyState.page = p;
                loadHistory();
            });
            numsWrap.appendChild(btn);
        }
    });
}

function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
}

/* ── View Past Record ────────────────────────────────── */
let isReplaying = false;

async function viewRecord(recordId) {
    // Navigate to results with loading
    navigateTo("results");
    document.getElementById("resultsEmpty").classList.add("hidden");
    document.getElementById("resultsContent").classList.add("hidden");
    document.getElementById("resultsLoading").classList.remove("hidden");
    document.getElementById("replayBanner").classList.add("hidden");

    try {
        const r = await fetch(`/history/${recordId}`);
        if (!r.ok) throw new Error("Record not found");
        const data = await r.json();

        // Store as current for PDF download + dashboard sync
        currentResult = data;
        currentInputs = data.inputs;
        currentPatientName = data.patient_name;
        selectedPatientRecord = data; // Sync to dashboard
        isReplaying = true;

        setTimeout(() => {
            document.getElementById("resultsLoading").classList.add("hidden");
            document.getElementById("resultsContent").classList.remove("hidden");

            // Show replay banner
            document.getElementById("replayName").textContent = data.patient_name || "Unknown";
            document.getElementById("replayDate").textContent = data.created_at || "—";
            document.getElementById("replayBanner").classList.remove("hidden");

            // Re-trigger animations
            document.getElementById("resultsContent").querySelectorAll(".animate-in").forEach(el => {
                el.style.animation = "none"; el.offsetHeight; el.style.animation = "";
            });

            renderResult(data);
            buildWhatIf(data.inputs);
            showToast(`📋 Viewing record of ${data.patient_name}`);
        }, 1200);

    } catch (err) {
        console.error(err);
        document.getElementById("resultsLoading").classList.add("hidden");
        document.getElementById("resultsEmpty").classList.remove("hidden");
        showToast("❌ Failed to load record");
    }
}

// Close replay banner
document.getElementById("replayClose").addEventListener("click", () => {
    document.getElementById("replayBanner").classList.add("hidden");
    isReplaying = false;
});

// Dashboard: Back to Overview button
document.getElementById("dpbClear").addEventListener("click", () => {
    clearPatientSelection();
});

// Dashboard: Download PDF for selected patient
document.getElementById("dpDownloadReport").addEventListener("click", async () => {
    if (!selectedPatientRecord) { showToast("⚠️ No patient selected"); return; }
    const btn = document.getElementById("dpDownloadReport");
    btn.disabled = true; btn.textContent = "Generating…";
    try {
        const r = await fetch("/report", {method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({inputs: selectedPatientRecord.inputs, result: selectedPatientRecord, patient_name: selectedPatientRecord.patient_name || "N/A"})});
        if (!r.ok) throw new Error("Server error");
        const data = await r.arrayBuffer();
        const blob = new Blob([data], {type:"application/pdf"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `CardioAI_Report_${(selectedPatientRecord.patient_name||"patient").replace(/\s+/g,"_")}.pdf`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        showToast("📄 Report downloaded");
    } catch(e) { console.error(e); showToast("❌ Report generation failed"); }
    finally { btn.disabled = false; btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download PDF Report`; }
});

/* ── PDF ─────────────────────────────────────────────── */
document.getElementById("downloadReport").addEventListener("click", async () => {
    if (!currentResult || !currentInputs) { showToast("⚠️ Run a prediction first"); return; }
    const btn = document.getElementById("downloadReport");
    btn.disabled = true; btn.textContent = "Generating…";
    try {
        const r = await fetch("/report",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({inputs:currentInputs, result:currentResult, patient_name: currentPatientName || "N/A"})});
        if (!r.ok) throw new Error("Server returned " + r.status);
        const data = await r.arrayBuffer();
        const blob = new Blob([data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Heart_Risk_Report.pdf";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast("✅ Report downloaded");
    } catch(e) { console.error(e); showToast("❌ Report failed"); }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Download PDF Report';
    }
});

/* ── Reset ────────────────────────────────────────────── */
document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("predictionForm").reset();
    document.getElementById("patient_name").classList.remove("invalid");
    KEYS.forEach(k => {
        const el = document.getElementById(k);
        el.classList.remove("invalid", "valid");
        // Remove any inline validation error messages
        const errSpan = el.parentElement.querySelector('.field-error');
        if (errSpan) { errSpan.classList.remove('visible'); errSpan.textContent = ''; }
    });
    currentResult = null; currentInputs = null; currentPatientName = null;
    showToast("🔄 Form reset");
});

/* ── Init ─────────────────────────────────────────────── */
loadDashboardStats();

})();
