const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBiiRMfeFJixkuesIyyEptEN5K806lUeYvB4l5IK2x6x_cXUPsidsW5hZF0zTzUcQI/exec"; // URL ของคุณ

let queue = [];
let currentPatient = null;

// --- จัดการผู้ป่วยใหม่ (New Patient Modal) ---
function openNewPatientModal() { 
    document.getElementById("newPatientModal").style.display = "block"; 
}
function closeModal() { 
    document.getElementById("newPatientModal").style.display = "none"; 
}

async function saveNewPatient() {
    const btn = document.querySelector(".modal-content .btn-success");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังสร้างโปรไฟล์..."; 
    btn.disabled = true;

    const payload = {
        action: "add_patient", // แจ้ง Apps Script ว่าเป็นการสร้างคนไข้ใหม่
        tbNo: document.getElementById("new-tbno").value,
        hn: document.getElementById("new-hn").value,
        name: document.getElementById("new-name").value,
        age: document.getElementById("new-age").value,
        gender: document.getElementById("new-gender").value,
        weight: document.getElementById("new-weight").value,
        startDate: document.getElementById("new-startdate").value
    };

    if(!payload.tbNo || !payload.hn || !payload.name) { 
        alert("กรุณากรอกข้อมูลสำคัญ (TB No, HN, ชื่อ) ให้ครบถ้วน"); 
        btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; 
        btn.disabled = false; 
        return; 
    }

    try {
        await fetch(APPSCRIPT_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            headers: { "Content-Type": "text/plain;charset=utf-8" }, 
            body: JSON.stringify(payload) 
        });
        alert("สร้างโปรไฟล์สำเร็จ! คุณสามารถพิมพ์ค้นหา HN หรือ TB No. นี้เพื่อเริ่มสั่งยาได้เลย");
        closeModal();
    } catch(err) { 
        alert("เกิดข้อผิดพลาดในการสร้างโปรไฟล์"); 
    } finally { 
        btn.innerHTML = "<i class='fas fa-save'></i> สร้างโปรไฟล์"; 
        btn.disabled = false; 
    }
}


// --- ระบบนำเข้าคิว ---
async function importBatch() {
    const input = document.getElementById("batch-input").value;
    if(!input) return;
    
    // แยก HN ด้วยการเว้นวรรค, ขึ้นบรรทัดใหม่, หรือลูกน้ำ
    const hns = input.split(/[\n\s,]+/).filter(Boolean).join(",");
    const btn = document.querySelector(".btn-primary");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังโหลด...";
    btn.disabled = true;

    try {
        const response = await fetch(`${APPSCRIPT_URL}?batch=true&query=${encodeURIComponent(hns)}`);
        const result = await response.json();
        
        if(result.status === "success") {
            result.data.forEach(pt => {
                if(!queue.find(q => q.hn === pt.hn)) queue.push(pt);
            });
            renderQueue();
            document.getElementById("batch-input").value = "";
        }
    } catch(err) { console.error(err); alert("ดึงข้อมูลล้มเหลว"); }
    
    btn.innerHTML = "<i class='fas fa-file-import'></i> ดึงประวัติเข้าคิว";
    btn.disabled = false;
}

async function addSingleQueue() {
    const query = document.getElementById("single-input").value.trim();
    if(!query) return;
    
    try {
        const response = await fetch(`${APPSCRIPT_URL}?batch=false&query=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if(result.status === "success") {
            const pt = result.data[0];
            pt.history = result.history; // เก็บประวัติไว้ใน object
            if(!queue.find(q => q.hn === pt.hn)) {
                queue.push(pt);
                renderQueue();
                document.getElementById("single-input").value = "";
            } else { alert("คนไข้อยู่ในคิวแล้ว"); }
        } else { alert("ไม่พบข้อมูลผู้ป่วยในระบบ"); }
    } catch(err) { console.error(err); }
}

function renderQueue() {
    const list = document.getElementById("queue-list");
    list.innerHTML = "";
    queue.forEach(pt => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${pt.tbNo}</strong><br><small>HN: ${pt.hn}</small> - ${pt.name}`;
        li.onclick = () => openWorkspace(pt);
        list.appendChild(li);
    });
}

// --- เปิดหน้า Dashboard ---
function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-age").innerText = pt.age;
    
    // Set Slider & Input
    document.getElementById("p-weight").value = pt.weight;
    
    // ตั้งค่าวางวันที่เริ่มยา (Start Date) จากฐานข้อมูล
    if(pt.startDate) {
        let sd = new Date(pt.startDate);
        if(!isNaN(sd.getTime())) { 
            document.getElementById("p-start-date").value = sd.toISOString().split('T')[0];
        }
    } else {
        document.getElementById("p-start-date").value = "";
    }

    // เซ็ตวันที่ Visit เป็นปัจจุบัน และจำนวนวันเป็น 28 วัน อัตโนมัติ (ผู้ใช้แก้ได้)
    if(document.getElementById("visit-date")) {
        document.getElementById("visit-date").value = new Date().toISOString().split('T')[0];
    }
    if(document.getElementById("dispense-days")) {
        document.getElementById("dispense-days").value = "28";
    }

    updateWeightSlider(); // กระตุ้นการเปลี่ยนตัวเลขและคำนวณสูตรยา
    // (ฟังก์ชัน renderRoadmap และ renderPillCalc จะถูกเรียกใช้ภายใน calculate() อัตโนมัติ)
}

function closeWorkspace() {
    currentPatient = null;
    document.getElementById("patient-workspace").style.display = "none";
    document.getElementById("welcome-screen").style.display = "flex";
}

// --- Clinical Logic (อ้างอิง Guideline ประเทศไทย) ---
function updateWeightSlider() {
    document.getElementById("weight-val").innerText = document.getElementById("p-weight").value;
    calculate();
}

function calculate() {
    const w = parseFloat(document.getElementById("p-weight").value);
    const age = parseFloat(document.getElementById("p-age").innerText);
    const gender = currentPatient.gender; 
    const scr = parseFloat(document.getElementById("p-scr").value) || 1.0;
    const regimen = document.getElementById("regimen-select").value;
    
    // 1. Calculate CrCl
    let crcl = ((140 - age) * w) / (72 * scr);
    if (gender === 'F' || gender === 'หญิง') crcl *= 0.85;
    
    const crclEl = document.getElementById("res-crcl");
    crclEl.innerText = crcl.toFixed(1);
    crclEl.style.color = crcl < 30 ? "red" : "var(--success)";
    let isRenal = crcl < 30;

    // 2. Recommend Dosage based on Guideline 2564/2566
    let outputHtml = "";
    let inh=0, r=0, z=0, e=0;
    
    // หาโดสยามาตรฐานตามช่วงน้ำหนักก่อน
    if (w < 35) { inh=200; r=300; z=750; e=600; }
    else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
    else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
    else { inh=300; r=600; z=2000; e=1200; }
        
    let hzStr = isRenal ? "<span style='color:red;'>[ปรับ 3 วัน/สัปดาห์ M,W,F]</span>" : "[ทุกวัน]";

    // นำโดสที่ได้มาจับคู่กับ Regimen ที่เลือก
    if (regimen === "HRZE") {
        outputHtml = `
            <strong>สูตร: 2HRZE / 4HR (น้ำหนัก ${w} kg)</strong><br><br>
            - Isoniazid (H): ${inh} mg 1x1 hs<br>
            - Rifampicin (R): ${r} mg 1x1 hs<br>
            - Pyrazinamide (Z): ${z} mg ${hzStr}<br>
            - Ethambutol (E): ${e} mg ${hzStr}<br><br>
            <span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>
        `;
    } 
    else if (regimen === "HRE" || regimen === "9HRE") {
        z = 0; // ตัด PZA ทิ้ง
        outputHtml = `
            <strong>สูตร: ${regimen} (กรณีตับอักเสบ/ห้ามใช้ Z)</strong><br><br>
            - Isoniazid (H): ${inh} mg 1x1 hs<br>
            - Rifampicin (R): ${r} mg 1x1 hs<br>
            - Ethambutol (E): ${e} mg ${hzStr}<br><br>
            <span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>
        `;
    }
    else if (regimen === "HR") {
        z = 0; e = 0; // ตัด PZA และ EMB ทิ้ง (ระยะต่อเนื่อง)
        outputHtml = `
            <strong>สูตร: HR (ระยะ Continuation Phase)</strong><br><br>
            - Isoniazid (H): ${inh} mg 1x1 hs<br>
            - Rifampicin (R): ${r} mg 1x1 hs<br><br>
            <span style='color:#666;'>*แนะนำจ่าย Vitamin B6 (50mg) 1x1 ร่วมด้วยเสมอ</span>
        `;
    }
    else if (regimen === "1HP") { // Guideline TPT 2566/2568
        let rpt = w < 35 ? 300 : (w <= 45 ? 450 : 600);
        outputHtml = `
            <strong>สูตร: 1HP (TPT / LTBI)</strong><br><br>
            - Isoniazid (H): 300 mg 1x1 (ทุกวัน)<br>
            - Rifapentine (RPT): ${rpt} mg 1x1 (ทุกวัน)<br>
            ระยะเวลา: 1 เดือน (28 โดส)
        `;
    }
    else if (regimen === "3HP") {
        let rpt = w <= 32 ? 600 : (w < 50 ? 750 : 900);
        outputHtml = `
            <strong>สูตร: 3HP (TPT / LTBI)</strong><br><br>
            - Isoniazid (H): 900 mg สัปดาห์ละ 1 ครั้ง<br>
            - Rifapentine (RPT): ${rpt} mg สัปดาห์ละ 1 ครั้ง<br>
            ระยะเวลา: 3 เดือน (12 โดส)
        `;
    }
    else if (regimen === "BPaLM") { // MDR-TB Guideline 2567
        outputHtml = `
            <strong>สูตร: BPaLM (MDR/RR-TB ระยะสั้น 6 เดือน)</strong><br><br>
            - Bedaquiline (B): 400 mg/วัน (2 สัปดาห์แรก) -> 200 mg จ.,พ.,ศ.<br>
            - Pretomanid (Pa): 200 mg 1x1<br>
            - Linezolid (L): 600 mg 1x1<br>
            - Moxifloxacin (M): 400 mg 1x1<br>
            <span style='color:red;'>*ต้องตรวจ ECG (QTc) และ CBC ติดตามสม่ำเสมอ</span>
        `;
    } else {
        outputHtml = `<strong>สูตรที่เลือก: ${regimen}</strong>`;
    }

    document.getElementById("res-regimen").innerHTML = outputHtml;
    
    // อัปเดตตาราง Pill Count และ Dashboard เสมอ เมื่อมีการคำนวณใหม่
    renderPillCalc(regimen, inh, r, z, e, isRenal);
    renderDashboard();
}

// --- ฟังก์ชันคำนวณจำนวนเม็ดยาอัจฉริยะ (Pill Count) ---
function renderPillCalc(regimen, inh, r, z, e, isRenal) {
    const daysInput = document.getElementById("dispense-days");
    if(!daysInput) return;
    
    const days = parseInt(daysInput.value) || 28;
    const weeks = days / 7;
    let html = "";
    
    // คำนวณเม็ดยาเฉพาะกลุ่มที่มี First-line drugs (HRZE, HRE, HR)
    if (["HRZE", "HRE", "9HRE", "HR"].includes(regimen)) {
        let freqDaily = days;
        // ยาไต M,W,F = สัปดาห์ละ 3 วัน 
        let freqRenal = isRenal ? Math.floor(weeks) * 3 : days;
        
        let h_pills = inh / 100; // เม็ดละ 100mg
        let r_pills = (r === 600) ? 2 : 1; 
        let r_size = (r === 450) ? 450 : 300; // แคปซูล 300 หรือ 450
        let z_pills = z / 500; // เม็ดละ 500mg
        let e_pills = Math.ceil(e / 400); // E ปัดขึ้นเสมอ ห้ามหักครึ่ง

        let trHtml = `<tr><th>รายการยา (Drug)</th><th>ขนาด/มื้อ</th><th>จำนวนมื้อ<br><small>(Doses)</small></th><th>รวมจ่าย <br><small>(Total)</small></th></tr>`;
        
        // Isoniazid
        trHtml += `<tr><td>Isoniazid (H) 100 mg</td><td>${h_pills} เม็ด</td><td>${freqDaily}</td><td><strong>${h_pills * freqDaily}</strong> เม็ด</td></tr>`;
        
        // Rifampicin
        trHtml += `<tr><td>Rifampicin (R) ${r_size} mg</td><td>${r_pills} แคปซูล<br><span class="alert-note">*(ห้ามแกะ/หักแคปซูล)</span></td><td>${freqDaily}</td><td><strong>${r_pills * freqDaily}</strong> แคปซูล</td></tr>`;
        
        // Pyrazinamide (มีเฉพาะในสูตร HRZE)
        if(z > 0) {
            trHtml += `<tr><td>Pyrazinamide (Z) 500 mg</td><td>${z_pills} เม็ด</td><td>${freqRenal}</td><td><strong>${z_pills * freqRenal}</strong> เม็ด</td></tr>`;
        }
        
        // Ethambutol (มีในสูตร HRZE, HRE, 9HRE)
        if(e > 0) {
            trHtml += `<tr><td>Ethambutol (E) 400 mg</td><td>${e_pills} เม็ด ${(e/400 !== e_pills) ? '<br><span class="alert-note">*(ปัดขึ้น ทิ้งครึ่งเม็ด)</span>' : ''}</td><td>${freqRenal}</td><td><strong>${e_pills * freqRenal}</strong> เม็ด</td></tr>`;
        }
        
        // Vitamin B6
        trHtml += `<tr><td>Vitamin B6 50 mg</td><td>1 เม็ด</td><td>${freqDaily}</td><td><strong>${freqDaily}</strong> เม็ด</td></tr>`;

        html = `<table class="pill-table">${trHtml}</table>`;
    } else {
        html = `<p style="color:#666; padding:10px;">(ระบบคำนวณเม็ดยาอัตโนมัติ รองรับเฉพาะกลุ่มสูตร First-line ในขณะนี้)</p>`;
    }
    document.getElementById("pill-calc-output").innerHTML = html;
}

function checkHepatotoxicity() {
    const ast = parseFloat(document.getElementById("lab-ast").value);
    const alt = parseFloat(document.getElementById("lab-alt").value);
    const alertBox = document.getElementById("liver-alert");
    
    // เกณฑ์ Stop Rule
    if(alt > 200 || ast > 200) { // > 5x ULN
        alertBox.innerHTML = "<i class='fas fa-radiation-alt'></i> <strong>ALERT: AST/ALT > 5x ULN!</strong><br>แนะนำหยุดยาวัณโรคทุกตัว (Stop Rule) และประเมินอาการทางคลินิกทันที";
        alertBox.classList.remove("hidden");
    } else if (alt > 120 || ast > 120) { // > 3x ULN
        alertBox.innerHTML = "<i class='fas fa-exclamation-circle'></i> <strong>WARNING: AST/ALT > 3x ULN</strong><br>หากผู้ป่วยมีอาการ (คลื่นไส้ อาเจียน ตัวเหลือง ตาเหลือง) ให้หยุดยาทันที";
        alertBox.classList.remove("hidden");
    } else {
        alertBox.classList.add("hidden");
    }
}

// --- Dashboard & Timeline (แสดงทางฝั่งซ้ายของจอ) ---
function renderDashboard() {
    if(!currentPatient) return;
    
    const startStr = document.getElementById("p-start-date").value;
    const visitDateInput = document.getElementById("visit-date");
    const visitStr = visitDateInput ? visitDateInput.value : new Date().toISOString().split('T')[0];
    
    const badge = document.getElementById("treatment-duration-badge");
    const board = document.getElementById("roadmap-board");

    // 1. คำนวณระยะเวลารักษาแบบอิสระ (ไม่จำกัดแค่ 6 เดือน)
    if(startStr && visitStr) {
        const start = new Date(startStr);
        const visit = new Date(visitStr);
        const diffTime = visit - start;
        
        if(diffTime >= 0) {
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const diffMonths = Math.floor(diffDays / 30);
            const remainDays = diffDays % 30;
            badge.innerHTML = `<i class="fas fa-clock"></i> รักษามาแล้ว: ${diffMonths} เดือน ${remainDays} วัน (รวม ${diffDays} วัน)`;
        } else {
            badge.innerHTML = "ระบุวัน Visit ผิดพลาด (ต้องไม่ก่อนวันเริ่มยา)";
        }
    } else {
        badge.innerHTML = "กรุณาระบุวันเริ่มยา";
    }

    // 2. วาดบอร์ดประวัติแบบการ์ด (Cards)
    if (!board) return;
    board.innerHTML = "";
    if(currentPatient.history && currentPatient.history.length > 0) {
        currentPatient.history.forEach((h, index) => {
            const dateStr = new Date(h.date).toLocaleDateString('th-TH');
            // ไฮไลท์การ์ดล่าสุด
            const borderStyle = index === 0 ? "border-left: 5px solid var(--success);" : "";
            const badgeLabel = index === 0 ? "<span style='background:var(--success);color:white;padding:3px 8px;border-radius:12px;font-size:12px;margin-left:10px;'>ล่าสุด</span>" : "";
            
            board.innerHTML += `
                <div class="visit-card" style="${borderStyle}">
                    <div class="visit-header">
                        <span class="visit-date"><i class="fas fa-calendar-check"></i> ${dateStr} ${badgeLabel}</span>
                        <span style="color:#888; font-size:14px;">Visit #${currentPatient.history.length - index}</span>
                    </div>
                    <div class="visit-metrics">
                        <span><i class="fas fa-weight"></i> ${h.weight} kg</span>
                        <span><i class="fas fa-vial"></i> CrCl: ${h.crcl}</span>
                        <span><i class="fas fa-microscope"></i> Labs: ${h.labs || '-'}</span>
                    </div>
                    <div class="visit-regimen">${h.regimen}</div>
                </div>
            `;
        });
    } else {
        board.innerHTML = "<p style='color:#888; text-align:center; padding: 20px;'>ยังไม่มีประวัติการจ่ายยาในระบบ</p>";
    }
}

// --- บันทึกข้อมูล Visit (คีย์ย้อนหลังได้ & ไม่ปิดหน้าต่าง) ---
async function saveData() {
    if(!currentPatient) return;

    const btn = document.querySelector(".btn-save");
    btn.innerHTML = "<i class='fas fa-spinner fa-spin'></i> กำลังบันทึกข้อมูล...";
    btn.disabled = true;

    // ดึงวันที่และวันนัด
    const vDate = document.getElementById("visit-date") ? document.getElementById("visit-date").value : new Date().toISOString().split('T')[0];
    const daysSupplied = document.getElementById("dispense-days") ? document.getElementById("dispense-days").value : 28;
    
    // พ่วงจำนวนวันนัดเข้ากับ Note ของสูตรยา
    const regimenNote = document.getElementById("res-regimen").innerText.replace(/\n/g, " ") + ` | [จ่ายยา ${daysSupplied} วัน]`;

    // รวบรวมข้อมูลที่จะบันทึก
    const payload = {
        action: "add_visit", // บอก Apps Script ว่าเป็นการเพิ่มประวัติ
        tbNo: currentPatient.tbNo,
        startDate: document.getElementById("p-start-date").value, 
        visitDate: vDate, 
        weight: document.getElementById("p-weight").value,
        scr: document.getElementById("p-scr").value,
        crcl: document.getElementById("res-crcl").innerText,
        regimen: regimenNote,
        labs: `AST/ALT: ${document.getElementById("lab-ast").value || '-'}/${document.getElementById("lab-alt").value || '-'}`
    };

    try {
        await fetch(APPSCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        
        // 1. ดันประวัติใหม่เข้าไปใน Local History ให้หน้าจออัปเดตทันที
        if(!currentPatient.history) currentPatient.history = [];
        currentPatient.history.unshift({
            date: vDate,
            weight: payload.weight,
            crcl: payload.crcl,
            regimen: payload.regimen,
            labs: payload.labs
        });
        
        // 2. เคลียร์ออกจากคิว Sidebar 
        queue = queue.filter(q => q.tbNo !== currentPatient.tbNo);
        renderQueue();
        
        // 3. วาด Dashboard และ Roadmap ใหม่ (หน้าจอยังเปิดอยู่)
        renderDashboard();
        
        alert(`บันทึกข้อมูลเรียบร้อย! (สามารถแก้ไขข้อมูล หรือกด "ปิดหน้าต่างนี้" เมื่อเสร็จสิ้น)`);
        
    } catch (error) {
        console.error("Save Error:", error);
        alert("เกิดข้อผิดพลาดในการเชื่อมต่ออินเทอร์เน็ต กรุณาลองใหม่");
    } finally {
        if(btn) {
            btn.innerHTML = "<i class='fas fa-save'></i> บันทึกข้อมูล Visit";
            btn.disabled = false;
        }
    }
}
