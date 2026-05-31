const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBiiRMfeFJixkuesIyyEptEN5K806lUeYvB4l5IK2x6x_cXUPsidsW5hZF0zTzUcQI/exec"; 

let queue = [];
let currentPatient = null;

// --- Network Status Monitor (Phase 5) ---
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

function updateNetworkStatus() {
    const badge = document.getElementById('network-badge');
    if (!badge) return;
    if (navigator.onLine) {
        badge.classList.remove('offline');
        badge.classList.add('online');
        badge.innerHTML = '<i class="fas fa-wifi"></i> Online';
        setTimeout(() => badge.classList.remove('show'), 2000);
    } else {
        badge.classList.remove('online');
        badge.classList.add('offline', 'show');
        badge.innerHTML = '<i class="fas fa-plane-slash"></i> Offline - โปรดตรวจสอบอินเทอร์เน็ต';
    }
}

// --- Modals ---
function openNewPatientModal() { document.getElementById("newPatientModal").style.display = "block"; }
function openKnowledgeModal() { document.getElementById("knowledgeModal").style.display = "block"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

// --- จัดการผู้ป่วยใหม่ ---
async function saveNewPatient() {
    const btn = document.querySelector("#newPatientModal .btn-success");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังสร้างโปรไฟล์..."; 
    btn.disabled = true;

    const payload = {
        action: "add_patient",
        tbNo: document.getElementById("new-tbno").value, 
        hn: document.getElementById("new-hn").value,
        name: document.getElementById("new-name").value, 
        age: document.getElementById("new-age").value,
        gender: document.getElementById("new-gender").value, 
        weight: document.getElementById("new-weight").value,
        startDate: document.getElementById("new-startdate").value, 
        allergy: document.getElementById("new-allergy").value,
        diag: document.getElementById("new-diag").value, 
        comorbidity: document.getElementById("new-comorb").value,
        arv: document.getElementById("new-arv").value, 
        status: "Active (กำลังรักษา)"
    };

    if(!payload.tbNo || !payload.hn || !payload.name) { 
        alert("กรุณากรอกข้อมูลสำคัญ (TB No, HN, ชื่อ) ให้ครบถ้วน"); 
        btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; btn.disabled = false; return; 
    }

    try {
        await fetch(APPSCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        alert("สร้างโปรไฟล์สำเร็จ! สามารถพิมพ์ค้นหา HN หรือ TB No. นี้เพื่อเริ่มสั่งยาได้เลย"); 
        closeModal('newPatientModal');
    } catch(err) { 
        console.error(err); 
        alert("บันทึกข้อมูลเรียบร้อยแล้ว (หรือเครือข่ายมีปัญหาการส่งสัญญาณกลับ)"); 
    } 
    finally { btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; btn.disabled = false; }
}

// --- Queue & Overview (Phase 5) ---
async function importBatch() {
    const input = document.getElementById("batch-input").value; if(!input) return;
    const hns = input.split(/[\n\s,]+/).filter(Boolean).join(",");
    const btn = document.querySelector(".btn-primary");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังโหลด..."; btn.disabled = true;

    try {
        const response = await fetch(`${APPSCRIPT_URL}?batch=true&query=${encodeURIComponent(hns)}`);
        const result = await response.json();
        if(result.status === "success") {
            result.data.forEach(pt => { if(!queue.find(q => q.hn === pt.hn)) queue.push(pt); });
            renderQueue(); 
            calculateOverviewStats(); 
            document.getElementById("batch-input").value = "";
        }
    } catch(err) { alert("ดึงข้อมูลล้มเหลว กรุณาตรวจสอบอินเทอร์เน็ต"); }
    btn.innerHTML = "<i class='fas fa-file-import'></i> ดึงประวัติเข้าคิว"; btn.disabled = false;
}

async function addSingleQueue() {
    const query = document.getElementById("single-input").value.trim(); if(!query) return;
    try {
        const response = await fetch(`${APPSCRIPT_URL}?batch=false&query=${encodeURIComponent(query)}`);
        const result = await response.json();
        if(result.status === "success") {
            const pt = result.data[0]; pt.history = result.history;
            if(!queue.find(q => q.hn === pt.hn)) { 
                queue.push(pt); 
                renderQueue(); 
                calculateOverviewStats(); 
                document.getElementById("single-input").value = ""; 
            }
        } else { alert("ไม่พบข้อมูลผู้ป่วยในระบบ"); }
    } catch(err) { console.error(err); }
}

function renderQueue() {
    const list = document.getElementById("queue-list"); list.innerHTML = "";
    queue.forEach(pt => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${pt.tbNo}</strong><br><small>HN: ${pt.hn}</small> - ${pt.name}`;
        li.onclick = () => openWorkspace(pt); list.appendChild(li);
    });
}

function calculateOverviewStats() {
    const overviewDiv = document.getElementById('clinic-overview');
    if (!overviewDiv) return;
    if (queue.length === 0) {
        overviewDiv.style.display = 'none';
        return;
    }
    
    let active = 0, mdr = 0, ltfu = 0, cured = 0;
    
    queue.forEach(pt => {
        const status = pt.status || "";
        const diag = pt.diag || "";
        
        if (status.includes("Active")) active++;
        if (diag.includes("MDR")) mdr++;
        if (status.includes("Lost")) ltfu++;
        if (status.includes("Cured") || status.includes("Completed")) cured++;
    });

    document.getElementById('stat-active').innerText = active;
    document.getElementById('stat-mdr').innerText = mdr;
    document.getElementById('stat-ltfu').innerText = ltfu;
    document.getElementById('stat-cured').innerText = cured;
    
    overviewDiv.style.display = 'block';
}

// --- Dashboard ---
function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    // แสดงโปรไฟล์
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-age").innerText = pt.age;
    document.getElementById("p-diag").innerText = pt.diag || "TB (ไม่ระบุชนิด)";
    document.getElementById("p-allergy").innerText = pt.allergy || "ปฏิเสธการแพ้ยา";
    
    // ข้อมูลคลินิก
    document.getElementById("p-status").value = pt.status || "Active (กำลังรักษา)";
    document.getElementById("p-comorb").value = pt.comorbidity || "";
    document.getElementById("p-arv").value = pt.arv || "";
    
    document.getElementById("p-weight").value = pt.weight;
    document.getElementById("p-weight-num").value = pt.weight;
    
    if(pt.startDate) {
        let sd = new Date(pt.startDate);
        if(!isNaN(sd.getTime())) document.getElementById("p-start-date").value = sd.toISOString().split('T')[0];
    } else { document.getElementById("p-start-date").value = ""; }

    document.getElementById("visit-date").value = new Date().toISOString().split('T')[0];
    setDays(28); 
    document.getElementById("remain-days").value = 0; 

    // เคลียร์ผล Lab และ Checkbox เก่า
    ['lab-ast','lab-alt','lab-tbdb','lab-afb','lab-xpert','lab-lpa','lab-qtcf'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = "";
    });
    document.getElementById("lab-symp").checked = false;
    document.getElementById("lab-neuro").checked = false;
    document.getElementById("clinical-alert").classList.add("hidden");
    document.getElementById("phase-transition-alert").classList.add("hidden");
    
    updateWeightSlider(); 
    checkInteractions(); 
}

function closeWorkspace() {
    currentPatient = null;
    document.getElementById("patient-workspace").style.display = "none";
    document.getElementById("welcome-screen").style.display = "flex";
}

// --- Sync น้ำหนัก (Slider กับ ตัวเลข) ---
function syncWeight(source) {
    const slider = document.getElementById("p-weight");
    const num = document.getElementById("p-weight-num");
    if(source === 'slider') num.value = slider.value;
    else if(source === 'num') slider.value = num.value;
    updateWeightSlider();
}

// --- Sync Dates (นัดหมาย & จำนวนวัน) ---
function setDays(d) {
    document.getElementById("dispense-days").value = d;
    syncDates('days');
}

function syncDates(source) {
    const vDateStr = document.getElementById("visit-date").value;
    const dInput = document.getElementById("dispense-days");
    const aInput = document.getElementById("next-appt-date");
    
    if(!vDateStr) return;
    const vDate = new Date(vDateStr);

    if(source === 'days' || source === 'visit') {
        const days = parseInt(dInput.value) || 0;
        if(days > 0) {
            let nextDate = new Date(vDate.getTime() + (days * 24 * 60 * 60 * 1000));
            aInput.value = nextDate.toISOString().split('T')[0];
        }
    } else if (source === 'appt') {
        if(aInput.value) {
            const nextDate = new Date(aInput.value);
            const diffTime = Math.abs(nextDate - vDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            dInput.value = diffDays;
        }
    }
    calculate();
}

// --- Advanced Drug Interactions & Alerts ---
function checkInteractions() {
    const meds = document.getElementById("p-arv").value.toUpperCase();
    const comorb = document.getElementById("p-comorb").value.toUpperCase();
    const regimen = document.getElementById("regimen-select").value;
    const warnBox = document.getElementById("interaction-alert");
    let warnings = [];

    if ((regimen.includes("HR") || regimen.includes("HP")) && (meds.includes("TAF") || meds.includes("PI") || meds.includes("LOPINAVIR") || meds.includes("DARUNAVIR") || meds.includes("LPV"))) {
        warnings.push("- <b>ห้ามใช้</b> Rifampicin/Rifapentine ร่วมกับ TAF หรือ Boosted PIs");
    }
    if (regimen.includes("HP") && meds.includes("DTG")) {
        warnings.push("- <b>ระวัง</b> การใช้ Rifapentine ร่วมกับ DTG (แนะนำปรับ DTG เป็น 50mg BID)");
    }
    if ((regimen.includes("HR") || regimen.includes("HP")) && (meds.includes("GLI") || meds.includes("SU") || comorb.includes("DM"))) {
        warnings.push("- <b>ระวัง</b> Rifampicin/Rifapentine อาจลดระดับยาเบาหวาน (SU) ระวังคุมน้ำตาลไม่อยู่");
    }
    if ((regimen.includes("HR") || regimen.includes("HP")) && (meds.includes("STATIN") || meds.includes("SIMVA") || meds.includes("ATORVA"))) {
        warnings.push("- <b>ระวัง</b> Rifampicin/Rifapentine อาจลดระดับยาลดไขมัน พิจารณาปรับ Dose Statin");
    }

    if (warnings.length > 0) {
        warnBox.innerHTML = `<strong><i class="fas fa-exclamation-triangle"></i> Drug Interaction:</strong><br>` + warnings.join("<br>");
        warnBox.classList.remove("hidden");
    } else { warnBox.classList.add("hidden"); }
}

function checkClinicalAlerts() {
    const ast = parseFloat(document.getElementById("lab-ast").value);
    const alt = parseFloat(document.getElementById("lab-alt").value);
    const qtcf = parseFloat(document.getElementById("lab-qtcf").value);
    const symp = document.getElementById("lab-symp").checked;
    const neuro = document.getElementById("lab-neuro").checked;
    const box = document.getElementById("clinical-alert");
    
    let alerts = [];
    let isStopRule = false;

    if(alt > 200 || ast > 200 || ((alt > 120 || ast > 120) && symp)) { 
        alerts.push("<i class='fas fa-radiation-alt'></i> <strong>Hepatitis (Stop Rule):</strong> AST/ALT > 5x ULN หรือ > 3x ULN แบบมีอาการ -> <u>หยุดยาทันที!</u>");
        isStopRule = true;
    } else if (alt > 120 || ast > 120) { 
        alerts.push("<i class='fas fa-exclamation-circle'></i> <strong>Hepatitis Warning:</strong> AST/ALT > 3x ULN เฝ้าระวังอาการตับอักเสบ หากเริ่มคลื่นไส้/ตัวเหลือง ให้หยุดยา");
    }

    if (qtcf > 500) {
        alerts.push("<i class='fas fa-heartbeat'></i> <strong>QTcF > 500ms (Stop Rule):</strong> เสี่ยง Torsades de Pointes -> <u>หยุดยา Bdq/Mfx ทันที</u> และตรวจ Electrolytes (K, Mg, Ca)");
        isStopRule = true;
    } else if (qtcf > 450) {
        alerts.push("<i class='fas fa-heartbeat'></i> <strong>QTcF Prolonged:</strong> > 450ms เฝ้าระวังคลื่นไฟฟ้าหัวใจ และตรวจสอบยาอื่นที่เพิ่ม QT");
    }

    if (neuro) {
        alerts.push("<i class='fas fa-nerve'></i> <strong>Neuropathy Warning:</strong> ผู้ป่วยมีอาการชา/มองเห็นผิดปกติ พิจารณาปรับ Dose Vitamin B6, หยุด EMB หรือลด/หยุด Lzd");
    }

    if (alerts.length > 0) {
        box.innerHTML = alerts.join("<br><br>");
        box.classList.remove("hidden");
        if(isStopRule) {
            box.style.color = "#dc2626"; box.style.background = "#fef2f2"; box.style.borderColor = "#ef4444";
        } else {
            box.style.color = "#d97706"; box.style.background = "#fffbeb"; box.style.borderColor = "#f59e0b";
        }
    } else { 
        box.classList.add("hidden"); 
    }
}

function generateSmartLabRec(regimen) {
    const labBox = document.getElementById("smart-lab-box");
    const labText = document.getElementById("smart-lab-text");
    const startStr = document.getElementById("p-start-date").value;
    const visitStr = document.getElementById("visit-date").value;
    let recs = [];

    if(!startStr) { recs.push("CXR, Sputum AFB x2, Xpert MTB/RIF, HIV, LFT, FBS, Cr (Baseline)"); }
    else {
        const diffMonths = Math.floor((new Date(visitStr) - new Date(startStr)) / (1000*60*60*24*30));
        if (diffMonths === 2 || diffMonths === 5) recs.push(`Sputum AFB x2 (ติดตามผลเดือนที่ ${diffMonths})`);
    }

    if(regimen === "BPaLM") recs.push("ECG (ติดตาม QTc), Electrolytes (K, Mg, Ca), CBC, LFT, TSH");
    if(regimen.includes("E") || regimen.includes("Lzd")) recs.push("ประเมินการมองเห็น/ตาบอดสี (VA, Color vision) และประเมินอาการชาปลายมือ/เท้า");

    if(recs.length > 0) {
        labText.innerHTML = recs.join(" <span style='color:#ccc'>|</span> ");
        labBox.classList.remove("hidden");
    } else { labBox.classList.add("hidden"); }
}

// --- Dosing Logic ---
function updateWeightSlider() {
    document.getElementById("weight-val").innerText = document.getElementById("p-weight-num").value;
    calculate();
}

function getDoseStr(name, baseDose, w, minF, maxF, maxD) {
    let min = Math.round(w * minF);
    let max = Math.round(w * maxF);
    let isMax = baseDose >= maxD;
    let maxHtml = isMax ? ` <span style='color:#ef4444; font-weight:bold;'>(Max dose)</span>` : '';
    return `- ${name}: <strong>${baseDose} mg</strong> <span style='color:#6b7280; font-size:0.95em;'>(${min}-${max}mg) [${minF}-${maxF} mkd]</span>${maxHtml}<br>`;
}

function calculate() {
    const w = parseFloat(document.getElementById("p-weight-num").value);
    const age = parseFloat(document.getElementById("p-age").innerText);
    const gender = currentPatient.gender; 
    const scr = parseFloat(document.getElementById("p-scr").value) || 1.0;
    const regimen = document.getElementById("regimen-select").value;
    
    checkInteractions(); 
    checkClinicalAlerts();
    
    let crcl = ((140 - age) * w) / (72 * scr);
    if (gender === 'F' || gender === 'หญิง') crcl *= 0.85;
    
    const crclEl = document.getElementById("res-crcl");
    crclEl.innerText = crcl.toFixed(1);
    crclEl.style.color = crcl < 30 ? "red" : "var(--success)";
    let isRenal = crcl < 30;

    let outputHtml = ""; let inh=0, r=0, z=0, e=0;
    
    if (w < 35) { inh=200; r=300; z=750; e=600; }
    else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
    else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
    else { inh=300; r=600; z=2000; e=1200; }
    
    let hzStr = isRenal ? "<br><span style='color:#ef4444; font-weight:bold;'>*ไตเสื่อม (CrCl < 30): ปรับ Z,E เป็น 3 วัน/สัปดาห์ (M,W,F)</span>" : "";

    if (regimen === "HRZE") {
        outputHtml = `<strong>สูตร: 2HRZE / 4HR (น้ำหนัก ${w} kg)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) + getDoseStr("RIF (R)", r, w, 8, 12, 600) +
                     getDoseStr("PZA (Z)", z, w, 20, 30, 2000) + getDoseStr("EMB (E)", e, w, 15, 20, 1200) + hzStr + 
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "HRE" || regimen === "9HRE") { 
        z = 0; 
        outputHtml = `<strong>สูตร: ${regimen} (กรณีตับอักเสบ/ห้ามใช้ Z)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) + getDoseStr("RIF (R)", r, w, 8, 12, 600) +
                     getDoseStr("EMB (E)", e, w, 15, 20, 1200) + hzStr +
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "HR") { 
        z = 0; e = 0; 
        outputHtml = `<strong>สูตร: HR (ระยะ Continuation Phase)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) + getDoseStr("RIF (R)", r, w, 8, 12, 600) + 
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "1HP") {
        let rpt = w < 35 ? 300 : (w <= 45 ? 450 : 600);
        outputHtml = `<strong>สูตร: 1HP (TPT)</strong><br><br>- INH (H): <strong>300 mg/day</strong> <br>- Rifapentine (RPT): <strong>${rpt} mg/day</strong>`;
    } else if (regimen === "3HP") {
        let rpt = w <= 32 ? 600 : (w < 50 ? 750 : 900);
        outputHtml = `<strong>สูตร: 3HP (TPT)</strong><br><br>- INH (H): <strong>900 mg/week</strong> <br>- Rifapentine (RPT): <strong>${rpt} mg/week</strong>`;
    } else if (regimen === "BPaLM") {
        let bpalmNote = "";
        if(isRenal) bpalmNote += "<br><span style='color:#d97706; font-weight:bold;'>*CrCl < 30: ยา BPaLM ไม่ต้องปรับ Dose แต่ให้ระวัง Lzd Toxicity (ไขกระดูก/ปลายประสาท)</span>";
        if(document.getElementById("lab-neuro").checked) bpalmNote += "<br><span style='color:#ef4444; font-weight:bold;'>*Neuropathy: พิจารณาลด Dose Linezolid เหลือ 300 mg/day หรือหยุดยา</span>";

        if(w < 30) { 
            outputHtml = `<strong style="color:red;">สูตร BPaLM: ไม่แนะนำสำหรับผู้ป่วยน้ำหนัก < 30 kg</strong>`; 
        } else {
            outputHtml = `<strong>สูตร: BPaLM (MDR/RR-TB ระยะสั้น 6 เดือน)</strong><br><br>
                          - Bdq: <strong>400->200 mg</strong><br>- Pa: <strong>200 mg</strong><br>- Lzd: <strong>600 mg</strong><br>- Mfx: <strong>400 mg</strong><br>
                          <span style='color:red;'>*ต้องตรวจ ECG (QTc), Electrolytes และ CBC ติดตามสม่ำเสมอ</span>` + bpalmNote;
        }
    }

    document.getElementById("res-regimen").innerHTML = outputHtml;
    
    renderPillCalc(regimen, inh, r, z, e, isRenal, w);
    generateSmartLabRec(regimen);
    renderDashboard();
}

function renderPillCalc(regimen, inh, r, z, e, isRenal, weight) {
    const targetDays = parseInt(document.getElementById("dispense-days").value) || 28;
    const remainDays = parseInt(document.getElementById("remain-days").value) || 0;
    const days = Math.max(0, targetDays - remainDays); 
    const weeks = Math.floor(days / 7);
    let html = "";
    
    let remainNote = remainDays > 0 ? `<div style="text-align:right; font-size:13px; color:#ef4444; margin-bottom:5px; font-weight:bold;">*หักลบยาเดิมที่เหลือ ${remainDays} วันแล้ว (เบิกจ่ายจริง ${days} วัน)</div>` : "";

    if (["HRZE", "HRE", "9HRE", "HR"].includes(regimen)) {
        let freqDaily = days; let freqRenal = isRenal ? weeks * 3 : days;
        let h_pills = inh / 100; let r_pills = (r === 600) ? 2 : 1; let r_size = (r === 450) ? 450 : 300; 
        let z_pills = z / 500; let e_pills = Math.ceil(e / 400); 

        let trHtml = `<tr><th>ยา</th><th>ขนาด</th><th>Doses</th><th>รวมเบิกจ่ายจริง</th></tr>`;
        trHtml += `<tr><td>INH 100mg</td><td>${h_pills} เม็ด</td><td>${freqDaily}</td><td><strong>${h_pills * freqDaily}</strong></td></tr>`;
        trHtml += `<tr><td>RIF ${r_size}mg</td><td>${r_pills} แคป<br><small style="color:red">*ห้ามแกะ</small></td><td>${freqDaily}</td><td><strong>${r_pills * freqDaily}</strong></td></tr>`;
        if(z > 0) trHtml += `<tr><td>PZA 500mg</td><td>${z_pills} เม็ด</td><td>${freqRenal}</td><td><strong>${z_pills * freqRenal}</strong></td></tr>`;
        if(e > 0) trHtml += `<tr><td>EMB 400mg</td><td>${e_pills} เม็ด<br><small style="color:red">${(e/400 !== e_pills)?'*ปัดขึ้น':''}</small></td><td>${freqRenal}</td><td><strong>${e_pills * freqRenal}</strong></td></tr>`;
        trHtml += `<tr><td>Vit B6 50mg</td><td>1 เม็ด</td><td>${freqDaily}</td><td><strong>${freqDaily}</strong></td></tr>`;
        html = remainNote + `<table class="pill-table">${trHtml}</table>`;
    } 
    else if (regimen === "1HP") {
        let rpt_pills = weight < 35 ? 2 : (weight <= 45 ? 3 : 4); 
        let warning = weight < 30 ? "<br><span class='alert-note'>*น.น.น้อย ระวัง ADR</span>" : "";
        html = remainNote + `<table class="pill-table"><tr><th>ยา (1HP)</th><th>ขนาด</th><th>Doses</th><th>รวมเบิกจ่ายจริง</th></tr>
        <tr><td>INH 100mg</td><td>3 เม็ด</td><td>${days} วัน</td><td><strong>${3 * days}</strong></td></tr>
        <tr><td>RPT 150mg</td><td>${rpt_pills} เม็ด${warning}</td><td>${days} วัน</td><td><strong>${rpt_pills * days}</strong></td></tr>
        <tr><td>Vit B6</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr></table>`;
    } 
    else if (regimen === "3HP") {
        let rpt_pills = weight <= 32 ? 4 : (weight < 50 ? 5 : 6);
        html = remainNote + `<table class="pill-table"><tr><th>ยา (3HP)</th><th>ขนาด</th><th>Doses</th><th>รวมเบิกจ่ายจริง</th></tr>
        <tr><td>INH 100mg</td><td>9 เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${9 * weeks}</strong></td></tr>
        <tr><td>RPT 150mg</td><td>${rpt_pills} เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${rpt_pills * weeks}</strong></td></tr>
        <tr><td>Vit B6</td><td>1 เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${weeks}</strong></td></tr></table>`;
    } 
    else if (regimen === "BPaLM") {
        if(weight < 30) return; 
        
        let bdqPills = 0;
        let vDateStr = document.getElementById("visit-date").value;
        let sDateStr = document.getElementById("p-start-date").value;
        
        if(!sDateStr) {
            document.getElementById("pill-calc-output").innerHTML = `<p style="color:red; font-weight:bold;">*กรุณาระบุวันเริ่มยา เพื่อให้ระบบคำนวณเม็ดยา Bedaquiline ได้ถูกต้อง</p>`;
            return;
        }

        let vDateObj = new Date(vDateStr);
        let sDateObj = new Date(sDateStr);
        
        for(let i=0; i<days; i++) {
            let currDate = new Date(vDateObj.getTime() + i*86400000);
            let dayDiff = Math.floor((currDate - sDateObj)/86400000);
            if (dayDiff < 14) { bdqPills += 4; } 
            else {
                let wd = currDate.getDay(); 
                if(wd === 1 || wd === 3 || wd === 5) bdqPills += 2; 
            }
        }
        
        let lzdDoseHtml = document.getElementById("lab-neuro").checked ? "300mg (ลดโดส)" : "600mg";

        html = remainNote + `<table class="pill-table"><tr><th>ยา (BPaLM)</th><th>ขนาด</th><th>Doses</th><th>รวมเบิกจ่ายจริง</th></tr>
        <tr><td>Bedaquiline 100mg</td><td>4เม็ด/วัน(14วันแรก)<br>2เม็ด จ.พ.ศ.(ต่อมา)</td><td>ตามสัปดาห์</td><td><strong>${bdqPills}</strong></td></tr>
        <tr><td>Pretomanid 200mg</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        <tr><td>Linezolid</td><td>${lzdDoseHtml}</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        <tr><td>Moxifloxacin 400mg</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        </table>`;
    }
    document.getElementById("pill-calc-output").innerHTML = html;
}

// --- Dashboard (แสดงประวัติ และ สรุป Roadmap) ---
function renderDashboard() {
    if(!currentPatient) return;
    const startStr = document.getElementById("p-start-date").value;
    const visitStr = document.getElementById("visit-date").value;
    const badge = document.getElementById("treatment-duration-badge");
    const board = document.getElementById("roadmap-board");
    const phaseAlert = document.getElementById("phase-transition-alert");

    let latestRegimen = "TB (ยังไม่มีการประเมิน)";
    if (currentPatient.history && currentPatient.history.length > 0) {
        latestRegimen = currentPatient.history[0].regimen.split('\n')[0].replace("สูตร: ", "").trim();
    } else {
        const regSelect = document.getElementById("regimen-select");
        latestRegimen = regSelect.options[regSelect.selectedIndex].text;
    }

    let targetMonths = 6;
    if(latestRegimen.includes("1HP")) targetMonths = 1;
    else if(latestRegimen.includes("3HP")) targetMonths = 3;
    else if(latestRegimen.includes("9HRE")) targetMonths = 9;

    if(startStr && visitStr) {
        const diffTime = new Date(visitStr) - new Date(startStr);
        if(diffTime >= 0) {
            const diffDays = Math.floor(diffTime / 86400000);
            const targetDays = targetMonths * 30;
            const remainTotalDays = targetDays - diffDays;
            
            let remainText = remainTotalDays > 0 
                ? `(เหลืออีก ${Math.floor(remainTotalDays/30)} เดือน ${remainTotalDays%30} วัน)` 
                : `<span style="color:#10b981; margin-left: 5px;">(ครบกำหนดรักษาแล้ว)</span>`;

            badge.innerHTML = `<i class="fas fa-clock"></i> รักษามาแล้ว: ${Math.floor(diffDays/30)} เดือน ${diffDays%30} วัน ${remainText}`;
            
            let pct = (diffDays / targetDays) * 100;
            document.getElementById("gantt-progress").style.width = Math.min(pct, 100) + "%";
            document.getElementById("gantt-info").innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <span><strong>สูตรปัจจุบัน:</strong> <span style="color:var(--primary); font-size:1.1em; font-weight:bold;">${latestRegimen}</span></span>
                    <span><strong>เป้าหมายระยะเวลา:</strong> ${targetMonths} เดือน</span>
                </div>`;
                
            // แจ้งเตือน Phase Transition (2 เดือน)
            if(latestRegimen.includes("HRZE") && diffDays >= 60 && diffDays < 90) {
                if(phaseAlert) phaseAlert.classList.remove("hidden");
            } else {
                if(phaseAlert) phaseAlert.classList.add("hidden");
            }
                
        } else {
            badge.innerHTML = "วัน Visit ผิดพลาด (ต้องไม่ก่อนวันเริ่มยา)";
            document.getElementById("gantt-progress").style.width = "0%";
            document.getElementById("gantt-info").innerHTML = `<strong>สูตรปัจจุบัน:</strong> ${latestRegimen}`;
            if(phaseAlert) phaseAlert.classList.add("hidden");
        }
    } else {
        badge.innerHTML = "ระบุวันเริ่มยา";
        document.getElementById("gantt-progress").style.width = "0%";
        document.getElementById("gantt-info").innerHTML = `<strong>สูตรปัจจุบัน:</strong> ${latestRegimen}`;
        if(phaseAlert) phaseAlert.classList.add("hidden");
    }

    board.innerHTML = "";
    if(currentPatient.history && currentPatient.history.length > 0) {
        currentPatient.history.forEach((h, i) => {
            const border = i === 0 ? "border-left: 5px solid var(--success);" : "";
            board.innerHTML += `
                <div class="visit-card" style="${border}">
                    <div class="visit-header">
                        <span class="visit-date"><i class="fas fa-calendar-check"></i> ${new Date(h.date).toLocaleDateString('th-TH')}</span>
                    </div>
                    <div class="visit-metrics" style="line-height:1.8;">
                        <span><i class="fas fa-weight"></i> ${h.weight} kg</span>
                        <span><i class="fas fa-vial"></i> CrCl: ${h.crcl}</span><br>
                        <span style="background:#fff3cd; color:#856404; width:100%;"><i class="fas fa-microscope"></i> Labs: ${h.labs || '-'}</span>
                    </div>
                    <div class="visit-regimen" style="white-space:pre-line;">${h.regimen}</div>
                </div>`;
        });
    } else { board.innerHTML = "<p style='color:#888; text-align:center;'>ยังไม่มีประวัติในระบบ</p>"; }
}

// --- บันทึก & สรุปข้อมูล ---
async function saveData() {
    if(!currentPatient) return;
    const btn = document.querySelector(".btn-save");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังบันทึก..."; btn.disabled = true;

    const vDate = document.getElementById("visit-date").value;
    const targetDays = document.getElementById("dispense-days").value;
    const remainDays = document.getElementById("remain-days").value;
    const actDays = Math.max(0, targetDays - remainDays);
    
    // แก้วันนัดถัดไป ไม่ให้เป็น Invalid Date
    let aDateStr = document.getElementById("next-appt-date").value;
    const nextAppt = aDateStr ? new Date(aDateStr).toLocaleDateString('th-TH') : "-";
    
    const regSelect = document.getElementById("regimen-select");
    const regName = regSelect.options[regSelect.selectedIndex].text;
    const regimenNote = `สูตร: ${regName}\n[นัด ${targetDays} วัน (หักยาเหลือ ${remainDays}) จ่ายจริง ${actDays} วัน | นัดถัดไป ${nextAppt}]`;

    // รวบรวม Lab + บันทึก Checkbox อาการลงไปในประวัติด้วย
    let labString = [];
    ['ast','alt','tbdb','afb','xpert','lpa', 'qtcf'].forEach(key => {
        let el = document.getElementById(`lab-${key}`);
        if(el && el.value && el.value !== "- เลือก -") labString.push(`${key.toUpperCase()}: ${el.value}`);
    });
    
    if(document.getElementById("lab-symp").checked) labString.push("SYMP: Yes (Hepatitis)");
    if(document.getElementById("lab-neuro").checked) labString.push("NEURO: Yes");

    const payload = {
        action: "add_visit", tbNo: currentPatient.tbNo,
        startDate: document.getElementById("p-start-date").value, visitDate: vDate, 
        weight: document.getElementById("p-weight-num").value, scr: document.getElementById("p-scr").value, crcl: document.getElementById("res-crcl").innerText,
        regimen: regimenNote, labs: labString.join(" | ") || "-",
        comorbidity: document.getElementById("p-comorb").value, arv: document.getElementById("p-arv").value, status: document.getElementById("p-status").value
    };

    try {
        await fetch(APPSCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
        
        if(!currentPatient.history) currentPatient.history = [];
        currentPatient.history.unshift({ date: vDate, weight: payload.weight, crcl: payload.crcl, regimen: payload.regimen, labs: payload.labs });
        
        currentPatient.comorbidity = payload.comorbidity;
        currentPatient.arv = payload.arv;
        currentPatient.status = payload.status;
        currentPatient.startDate = payload.startDate;

        renderQueue(); renderDashboard();
        alert(`บันทึกข้อมูลเรียบร้อย! ประวัติอัปเดตลงบอร์ดซ้ายมือแล้ว`);
    } catch (err) { 
        console.error(err); 
        alert("บันทึกข้อมูลเรียบร้อยแล้ว (หรือเกิดปัญหาการรับส่งข้อความกลับ)"); 
    }
    finally { btn.innerHTML = "<i class='fas fa-save'></i> บันทึกข้อมูล Visit"; btn.disabled = false; }
}

function generateSummary() {
    if(!currentPatient) return;
    
    let vDateStr = document.getElementById("visit-date").value;
    const vDate = vDateStr ? new Date(vDateStr).toLocaleDateString('th-TH') : "-";
    
    const w = document.getElementById("p-weight-num").value;
    const crcl = document.getElementById("res-crcl").innerText;
    
    const regSelect = document.getElementById("regimen-select");
    const regName = regSelect.options[regSelect.selectedIndex].text;
    
    const targetDays = document.getElementById("dispense-days").value;
    const remainDays = document.getElementById("remain-days").value;
    const actDays = Math.max(0, targetDays - remainDays);
    
    // ป้องกัน Invalid Date
    let aDateStr = document.getElementById("next-appt-date").value;
    const nextAppt = aDateStr ? new Date(aDateStr).toLocaleDateString('th-TH') : "-";

    let labString = [];
    ['ast','alt','tbdb','afb','xpert','lpa', 'qtcf'].forEach(key => {
        let el = document.getElementById(`lab-${key}`);
        if(el && el.value && el.value !== "- เลือก -") labString.push(`${key.toUpperCase()}: ${el.value}`);
    });
    
    if(document.getElementById("lab-symp").checked) labString.push("Symptomatic Hepatitis: Yes");
    if(document.getElementById("lab-neuro").checked) labString.push("Neuropathy: Yes");

    const summaryStr = `========== TB DISPENSING SUMMARY ==========\n` +
        `วันที่: ${vDate}\n` +
        `ชื่อ: ${currentPatient.name} (HN: ${currentPatient.hn})\n` +
        `Diagnosis: ${currentPatient.diag || '-'}\n` +
        `สถานะ: ${document.getElementById("p-status").value}\n` +
        `แพ้ยา: ${currentPatient.allergy || 'ปฏิเสธ'}\n` +
        `โรคร่วม/ARV: ${document.getElementById("p-comorb").value || '-'} / ${document.getElementById("p-arv").value || '-'}\n` +
        `น้ำหนัก: ${w} kg | CrCl: ${crcl} ml/min\n` +
        `-------------------------------------------\n` +
        `สูตรยา: ${regName}\n` +
        `เป้าหมายวันนัด: ${targetDays} วัน\n` +
        `หักยาเดิมเหลือ: ${remainDays} วัน\n` +
        `รวมเบิกจ่ายจริง: ${actDays} วัน\n` +
        `วันนัดครั้งถัดไป: ${nextAppt}\n` +
        `ผลแล็บและอาการ: ${labString.join(" | ") || 'ไม่มีข้อมูล'}\n` +
        `===========================================`;

    document.getElementById("summary-text").value = summaryStr;
    document.getElementById("summaryModal").style.display = "block";
}

function copySummaryText() {
    const copyText = document.getElementById("summary-text");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value).then(() => {
        alert("คัดลอกข้อความเรียบร้อยแล้ว! สามารถนำไปวางใน HIS หรือ Google Sheet ได้เลย");
    }).catch(err => {
        alert("เกิดข้อผิดพลาดในการคัดลอก");
    });
}
