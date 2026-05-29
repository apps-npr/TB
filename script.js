const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBiiRMfeFJixkuesIyyEptEN5K806lUeYvB4l5IK2x6x_cXUPsidsW5hZF0zTzUcQI/exec"; // URL ของคุณ

let queue = [];
let currentPatient = null;

// --- Modals ---
function openNewPatientModal() { document.getElementById("newPatientModal").style.display = "block"; }
function openKnowledgeModal() { document.getElementById("knowledgeModal").style.display = "block"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

async function saveNewPatient() {
    const btn = document.querySelector("#newPatientModal .btn-success");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังสร้างโปรไฟล์..."; btn.disabled = true;

    const payload = {
        action: "add_patient",
        tbNo: document.getElementById("new-tbno").value, hn: document.getElementById("new-hn").value,
        name: document.getElementById("new-name").value, age: document.getElementById("new-age").value,
        gender: document.getElementById("new-gender").value, weight: document.getElementById("new-weight").value,
        startDate: document.getElementById("new-startdate").value, allergy: document.getElementById("new-allergy").value,
        diag: document.getElementById("new-diag").value
    };

    if(!payload.tbNo || !payload.hn || !payload.name) { 
        alert("กรุณากรอกข้อมูลให้ครบถ้วน"); btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; btn.disabled = false; return; 
    }

    try {
        await fetch(APPSCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        alert("สร้างโปรไฟล์สำเร็จ! ค้นหาเพื่อสั่งยาได้เลย"); closeModal('newPatientModal');
    } catch(err) { alert("เกิดข้อผิดพลาด"); } 
    finally { btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; btn.disabled = false; }
}

// --- Queue ---
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
            renderQueue(); document.getElementById("batch-input").value = "";
        }
    } catch(err) { alert("ดึงข้อมูลล้มเหลว"); }
    btn.innerHTML = "<i class='fas fa-file-import'></i> ดึงประวัติเข้าคิว"; btn.disabled = false;
}

async function addSingleQueue() {
    const query = document.getElementById("single-input").value.trim(); if(!query) return;
    try {
        const response = await fetch(`${APPSCRIPT_URL}?batch=false&query=${encodeURIComponent(query)}`);
        const result = await response.json();
        if(result.status === "success") {
            const pt = result.data[0]; pt.history = result.history;
            if(!queue.find(q => q.hn === pt.hn)) { queue.push(pt); renderQueue(); document.getElementById("single-input").value = ""; }
        } else { alert("ไม่พบข้อมูลผู้ป่วย"); }
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

// --- Dashboard ---
function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-age").innerText = pt.age;
    document.getElementById("p-diag").innerText = pt.diag || "TB (ไม่ระบุชนิด)";
    document.getElementById("p-allergy").innerText = pt.allergy || "ปฏิเสธการแพ้ยา";
    document.getElementById("p-weight").value = pt.weight;
    
    if(pt.startDate) {
        let sd = new Date(pt.startDate);
        if(!isNaN(sd.getTime())) document.getElementById("p-start-date").value = sd.toISOString().split('T')[0];
    } else { document.getElementById("p-start-date").value = ""; }

    document.getElementById("visit-date").value = new Date().toISOString().split('T')[0];
    setDays(28); 

    ['lab-ast','lab-alt','lab-tbdb','lab-afb','lab-xpert','lab-lpa'].forEach(id => document.getElementById(id).value = "");
    updateWeightSlider(); 
}

function closeWorkspace() {
    currentPatient = null;
    document.getElementById("patient-workspace").style.display = "none";
    document.getElementById("welcome-screen").style.display = "flex";
}

// --- Sync Dates ---
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

// --- Dosing Logic ---
function updateWeightSlider() {
    document.getElementById("weight-val").innerText = document.getElementById("p-weight").value;
    calculate();
}

// ฟังก์ชันดึง String แนะนำช่วง Dose 
function getDoseStr(name, baseDose, w, minF, maxF, maxD) {
    let min = Math.round(w * minF);
    let max = Math.round(w * maxF);
    let isMax = baseDose >= maxD;
    let maxHtml = isMax ? ` <span style='color:#ef4444; font-weight:bold;'>(Max dose)</span>` : '';
    return `- ${name}: <strong>${baseDose} mg</strong> <span style='color:#6b7280; font-size:0.95em;'>(${min}-${max}mg) [${minF}-${maxF} mkd]</span>${maxHtml}<br>`;
}

function calculate() {
    const w = parseFloat(document.getElementById("p-weight").value);
    const age = parseFloat(document.getElementById("p-age").innerText);
    const gender = currentPatient.gender; 
    const scr = parseFloat(document.getElementById("p-scr").value) || 1.0;
    const regimen = document.getElementById("regimen-select").value;
    
    let crcl = ((140 - age) * w) / (72 * scr);
    if (gender === 'F' || gender === 'หญิง') crcl *= 0.85;
    
    const crclEl = document.getElementById("res-crcl");
    crclEl.innerText = crcl.toFixed(1);
    crclEl.style.color = crcl < 30 ? "red" : "var(--success)";
    let isRenal = crcl < 30;

    let outputHtml = ""; let inh=0, r=0, z=0, e=0;
    
    // First-line Dose Base
    if (w < 35) { inh=200; r=300; z=750; e=600; }
    else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
    else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
    else { inh=300; r=600; z=2000; e=1200; }
    
    let hzStr = isRenal ? "<br><span style='color:#ef4444; font-weight:bold;'>*ไตเสื่อม (CrCl < 30): ปรับ Z,E เป็น 3 วัน/สัปดาห์ (M,W,F)</span>" : "";

    if (regimen === "HRZE") {
        outputHtml = `<strong>สูตร: 2HRZE / 4HR (น้ำหนัก ${w} kg)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) +
                     getDoseStr("RIF (R)", r, w, 8, 12, 600) +
                     getDoseStr("PZA (Z)", z, w, 20, 30, 2000) +
                     getDoseStr("EMB (E)", e, w, 15, 20, 1200) + hzStr + 
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "HRE" || regimen === "9HRE") { 
        z = 0; 
        outputHtml = `<strong>สูตร: ${regimen} (กรณีตับอักเสบ/ห้ามใช้ Z)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) +
                     getDoseStr("RIF (R)", r, w, 8, 12, 600) +
                     getDoseStr("EMB (E)", e, w, 15, 20, 1200) + hzStr +
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "HR") { 
        z = 0; e = 0; 
        outputHtml = `<strong>สูตร: HR (ระยะ Continuation Phase)</strong><br><br>` +
                     getDoseStr("INH (H)", inh, w, 4, 6, 300) +
                     getDoseStr("RIF (R)", r, w, 8, 12, 600) + 
                     `<br><span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>`;
    } else if (regimen === "1HP") {
        let rpt = w < 35 ? 300 : (w <= 45 ? 450 : 600);
        outputHtml = `<strong>สูตร: 1HP (TPT / LTBI)</strong><br><br>
                      - INH (H): 300 mg/day <br>
                      - Rifapentine (RPT): ${rpt} mg/day <br><br>
                      ระยะเวลา: 1 เดือน (28 โดส)`;
    } else if (regimen === "3HP") {
        let rpt = w <= 32 ? 600 : (w < 50 ? 750 : 900);
        outputHtml = `<strong>สูตร: 3HP (TPT / LTBI)</strong><br><br>
                      - INH (H): 900 mg/week <br>
                      - Rifapentine (RPT): ${rpt} mg/week <br><br>
                      ระยะเวลา: 3 เดือน (12 โดส)`;
    } else if (regimen === "BPaLM") {
        if(w < 30) {
            outputHtml = `<strong style="color:red;">สูตร BPaLM: ไม่แนะนำสำหรับผู้ป่วยน้ำหนัก < 30 kg</strong>`;
        } else {
            outputHtml = `<strong>สูตร: BPaLM (MDR/RR-TB ระยะสั้น 6 เดือน)</strong><br><br>
                          - Bdq: 400->200mg | - Pa: 200mg | - Lzd: 600mg | - Mfx: 400mg<br><br>
                          <span style='color:red;'>*ต้องตรวจ ECG (QTc) และ CBC ติดตามสม่ำเสมอ</span>`;
        }
    }

    document.getElementById("res-regimen").innerHTML = outputHtml;
    
    renderPillCalc(regimen, inh, r, z, e, isRenal, w);
    generateSmartLabRec(regimen);
    renderDashboard();
}

function renderPillCalc(regimen, inh, r, z, e, isRenal, weight) {
    const days = parseInt(document.getElementById("dispense-days").value) || 28;
    const weeks = Math.floor(days / 7);
    let html = "";
    
    if (["HRZE", "HRE", "9HRE", "HR"].includes(regimen)) {
        let freqDaily = days; let freqRenal = isRenal ? weeks * 3 : days;
        let h_pills = inh / 100; let r_pills = (r === 600) ? 2 : 1; let r_size = (r === 450) ? 450 : 300; 
        let z_pills = z / 500; let e_pills = Math.ceil(e / 400); 

        let trHtml = `<tr><th>ยา</th><th>ขนาด</th><th>Doses</th><th>รวมจ่าย</th></tr>`;
        trHtml += `<tr><td>INH 100mg</td><td>${h_pills} เม็ด</td><td>${freqDaily}</td><td><strong>${h_pills * freqDaily}</strong></td></tr>`;
        trHtml += `<tr><td>RIF ${r_size}mg</td><td>${r_pills} แคป<br><small style="color:red">*ห้ามแกะ</small></td><td>${freqDaily}</td><td><strong>${r_pills * freqDaily}</strong></td></tr>`;
        if(z > 0) trHtml += `<tr><td>PZA 500mg</td><td>${z_pills} เม็ด</td><td>${freqRenal}</td><td><strong>${z_pills * freqRenal}</strong></td></tr>`;
        if(e > 0) trHtml += `<tr><td>EMB 400mg</td><td>${e_pills} เม็ด<br><small style="color:red">${(e/400 !== e_pills)?'*ปัดขึ้น':''}</small></td><td>${freqRenal}</td><td><strong>${e_pills * freqRenal}</strong></td></tr>`;
        trHtml += `<tr><td>Vit B6 50mg</td><td>1 เม็ด</td><td>${freqDaily}</td><td><strong>${freqDaily}</strong></td></tr>`;
        html = `<table class="pill-table">${trHtml}</table>`;
    } 
    else if (regimen === "1HP") {
        let rpt_pills = weight < 35 ? 2 : (weight <= 45 ? 3 : 4); 
        let warning = weight < 30 ? "<br><span class='alert-note'>*น.น.น้อย ระวัง ADR</span>" : "";
        html = `<table class="pill-table"><tr><th>ยา (1HP)</th><th>ขนาด</th><th>Doses</th><th>รวมจ่าย</th></tr>
        <tr><td>INH 100mg</td><td>3 เม็ด</td><td>${days} วัน</td><td><strong>${3 * days}</strong></td></tr>
        <tr><td>RPT 150mg</td><td>${rpt_pills} เม็ด${warning}</td><td>${days} วัน</td><td><strong>${rpt_pills * days}</strong></td></tr>
        <tr><td>Vit B6</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr></table>`;
    } 
    else if (regimen === "3HP") {
        let rpt_pills = weight <= 32 ? 4 : (weight < 50 ? 5 : 6);
        html = `<table class="pill-table"><tr><th>ยา (3HP)</th><th>ขนาด</th><th>Doses</th><th>รวมจ่าย</th></tr>
        <tr><td>INH 100mg</td><td>9 เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${9 * weeks}</strong></td></tr>
        <tr><td>RPT 150mg</td><td>${rpt_pills} เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${rpt_pills * weeks}</strong></td></tr>
        <tr><td>Vit B6</td><td>1 เม็ด</td><td>${weeks} สัปดาห์</td><td><strong>${weeks}</strong></td></tr></table>`;
    } 
    else if (regimen === "BPaLM") {
        if(weight < 30) return; // ไม่คำนวณถ้า น.น. ไม่ถึง
        
        let bdqPills = 0;
        let vDateObj = new Date(document.getElementById("visit-date").value);
        let sDateObj = new Date(document.getElementById("p-start-date").value);
        
        for(let i=0; i<days; i++) {
            let currDate = new Date(vDateObj.getTime() + i*86400000);
            let dayDiff = Math.floor((currDate - sDateObj)/86400000);
            if (dayDiff < 14) { bdqPills += 4; } // 14 วันแรก กินทุกวัน (4 เม็ด)
            else {
                let wd = currDate.getDay(); 
                if(wd === 1 || wd === 3 || wd === 5) bdqPills += 2; // หลังจากนั้น จ,พ,ศ (2 เม็ด)
            }
        }
        html = `<table class="pill-table"><tr><th>ยา (BPaLM)</th><th>ขนาด</th><th>Doses</th><th>รวมจ่าย</th></tr>
        <tr><td>Bedaquiline 100mg</td><td>4เม็ด/วัน(14วันแรก)<br>2เม็ด จ.พ.ศ.(ต่อมา)</td><td>ตามสัปดาห์</td><td><strong>${bdqPills}</strong></td></tr>
        <tr><td>Pretomanid 200mg</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        <tr><td>Linezolid 600mg</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        <tr><td>Moxifloxacin 400mg</td><td>1 เม็ด</td><td>${days} วัน</td><td><strong>${days}</strong></td></tr>
        </table>`;
    }
    document.getElementById("pill-calc-output").innerHTML = html;
}

function checkHepatotoxicity() {
    const ast = parseFloat(document.getElementById("lab-ast").value);
    const alt = parseFloat(document.getElementById("lab-alt").value);
    const box = document.getElementById("liver-alert");
    if(alt > 200 || ast > 200) { 
        box.innerHTML = "<strong>ALERT (Stop Rule):</strong> AST/ALT > 5x ULN หยุดยาทันที!"; box.classList.remove("hidden"); box.style.color = "red";
    } else if (alt > 120 || ast > 120) { 
        box.innerHTML = "<strong>WARNING:</strong> AST/ALT > 3x ULN หากมีอาการให้หยุดยาทันที"; box.classList.remove("hidden"); box.style.color = "orange";
    } else { box.classList.add("hidden"); }
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

    if(regimen === "BPaLM") recs.push("ECG (ติดตาม QTc), CBC, LFT, TSH");
    if(regimen.includes("E")) recs.push("ประเมินการมองเห็น (VA, Color vision)");

    if(recs.length > 0) {
        labText.innerHTML = recs.join(" <span style='color:#ccc'>|</span> ");
        labBox.classList.remove("hidden");
    } else { labBox.classList.add("hidden"); }
}

// --- Dashboard ---
function renderDashboard() {
    if(!currentPatient) return;
    const startStr = document.getElementById("p-start-date").value;
    const visitStr = document.getElementById("visit-date").value;
    const badge = document.getElementById("treatment-duration-badge");
    const board = document.getElementById("roadmap-board");

    if(startStr && visitStr) {
        const diffTime = new Date(visitStr) - new Date(startStr);
        if(diffTime >= 0) {
            const diffDays = Math.floor(diffTime / 86400000);
            badge.innerHTML = `<i class="fas fa-clock"></i> รักษามาแล้ว: ${Math.floor(diffDays/30)} เดือน ${diffDays%30} วัน`;
            
            // ปรับแถบ Roadmap
            let targetMonths = 6;
            const reg = document.getElementById("regimen-select").value;
            if(reg==="1HP") targetMonths=1; if(reg==="3HP") targetMonths=3;
            
            let pct = (diffDays / (targetMonths*30)) * 100;
            document.getElementById("gantt-progress").style.width = Math.min(pct, 100) + "%";
        } else badge.innerHTML = "วัน Visit ผิดพลาด";
    } else {
        badge.innerHTML = "ระบุวันเริ่มยา";
        document.getElementById("gantt-progress").style.width = "0%";
    }

    // วาด Card (แก้ไขบั๊กการแสดงผลให้เรียบร้อย)
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

// --- บันทึกข้อมูล ---
async function saveData() {
    if(!currentPatient) return;
    const btn = document.querySelector(".btn-save");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังบันทึก..."; btn.disabled = true;

    const vDate = document.getElementById("visit-date").value;
    const daysSupplied = document.getElementById("dispense-days").value;
    const nextAppt = document.getElementById("next-appt-date").value;
    
    // บันทึกเฉพาะชื่อสูตร เพื่อป้องกันการขึ้น | ยาวเหยียดในหน้า Dashboard
    const regSelect = document.getElementById("regimen-select");
    const regName = regSelect.options[regSelect.selectedIndex].text;
    const regimenNote = `สูตร: ${regName}\n[จ่ายยา ${daysSupplied} วัน | นัด ${nextAppt}]`;

    // รวบรวม Lab
    let labString = [];
    ['ast','alt','tbdb','afb','xpert','lpa'].forEach(key => {
        let val = document.getElementById(`lab-${key}`).value;
        if(val && val !== "- เลือก -") labString.push(`${key.toUpperCase()}: ${val}`);
    });

    const payload = {
        action: "add_visit", tbNo: currentPatient.tbNo,
        startDate: document.getElementById("p-start-date").value, visitDate: vDate, 
        weight: document.getElementById("p-weight").value, scr: document.getElementById("p-scr").value, crcl: document.getElementById("res-crcl").innerText,
        regimen: regimenNote, labs: labString.join(" | ") || "-"
    };

    try {
        await fetch(APPSCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
        
        if(!currentPatient.history) currentPatient.history = [];
        currentPatient.history.unshift({ date: vDate, weight: payload.weight, crcl: payload.crcl, regimen: payload.regimen, labs: payload.labs });
        
        renderQueue(); renderDashboard();
        alert(`บันทึกข้อมูลเรียบร้อย! ประวัติอัปเดตลงบอร์ดซ้ายมือแล้ว`);
    } catch (err) { alert("เกิดข้อผิดพลาด"); }
    finally { btn.innerHTML = "<i class='fas fa-save'></i> บันทึกข้อมูล Visit"; btn.disabled = false; }
}
