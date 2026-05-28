const APPSCRIPT_URL = "YOUR_WEB_APP_URL_HERE"; // ใส่ URL ใหม่ของคุณ

let queue = [];
let currentPatient = null;

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
    
    btn.innerHTML = "<i class='fas fa-file-import'></i> นำเข้าคิว (Batch)";
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
        } else { alert("ไม่พบข้อมูล"); }
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

// --- ระบบ UI & Tabs ---
function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-age").innerText = pt.age;
    
    // Set Slider & Gender
    document.getElementById("p-weight").value = pt.weight;
    updateWeightSlider(); // กระตุ้นการเปลี่ยนตัวเลขและคำนวณ

    // Render History Table
    const tBody = document.getElementById("history-body");
    tBody.innerHTML = "";
    if(pt.history && pt.history.length > 0) {
        pt.history.forEach(h => {
            tBody.innerHTML += `<tr>
                <td>${new Date(h.date).toLocaleDateString('th-TH')}</td>
                <td>${h.weight}</td>
                <td>${h.crcl}</td>
                <td>${h.regimen}</td>
                <td>${h.labs}</td>
            </tr>`;
        });
    } else {
        tBody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>ยังไม่มีประวัติการรับยา</td></tr>";
    }

    switchTab('tab-dosing'); // Default tab
}

function closeWorkspace() {
    document.getElementById("patient-workspace").style.display = "none";
    document.getElementById("welcome-screen").style.display = "flex";
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// --- Clinical Logic (อ้างอิง Guideline ประเทศไทย) ---
function updateWeightSlider() {
    const w = document.getElementById("p-weight").value;
    document.getElementById("weight-val").innerText = w;
    calculate();
}

function calculate() {
    const w = parseFloat(document.getElementById("p-weight").value);
    const age = parseFloat(document.getElementById("p-age").innerText);
    const gender = currentPatient.gender; // "M" หรือ "F"
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
    
    if (regimen === "HRZE") {
        let inh=0, r=0, z=0, e=0;
        if (w < 35) { inh=200; r=300; z=750; e=600; }
        else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
        else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
        else { inh=300; r=600; z=2000; e=1200; }
        
        let hzStr = isRenal ? "<span style='color:red;'>[ปรับ 3 วัน/สัปดาห์ M,W,F]</span>" : "[ทุกวัน]";
        outputHtml = `
            <strong>สูตร: 2HRZE / 4HR (น้ำหนัก ${w} kg)</strong><br><br>
            - Isoniazid (H): ${inh} mg 1x1 hs<br>
            - Rifampicin (R): ${r} mg 1x1 hs<br>
            - Pyrazinamide (Z): ${z} mg ${hzStr}<br>
            - Ethambutol (E): ${e} mg ${hzStr}<br><br>
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
    }

    document.getElementById("res-regimen").innerHTML = outputHtml;
}

function checkHepatotoxicity() {
    const ast = parseFloat(document.getElementById("lab-ast").value);
    const alt = parseFloat(document.getElementById("lab-alt").value);
    const alertBox = document.getElementById("liver-alert");
    
    // สมมติ ULN = 40 U/L
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
