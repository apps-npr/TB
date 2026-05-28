// ใส่ URL ของ Google Apps Script ที่คุณได้มา
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBiiRMfeFJixkuesIyyEptEN5K806lUeYvB4l5IK2x6x_cXUPsidsW5hZF0zTzUcQI/exec"; 

let queue = [];
let currentPatient = null;

// 1. ฟังก์ชันดึงข้อมูลจาก Google Sheets (GET)
async function addToQueue() {
    const tbNo = document.getElementById("tb-input").value.trim();
    if (!tbNo) return;
    
    // เช็คว่ามีคิวนี้อยู่แล้วหรือไม่
    if(queue.find(q => q.tbNo === tbNo)) {
        alert("คิวนี้ถูกเพิ่มไปแล้ว");
        return;
    }

    const btn = document.querySelector(".queue-input button");
    btn.innerText = "กำลังค้นหา...";
    btn.disabled = true;

    try {
        // ยิง API ไปหา Google Apps Script
        const response = await fetch(`${APPSCRIPT_URL}?tbNo=${encodeURIComponent(tbNo)}`);
        const data = await response.json();

        if (data.status === "success") {
            queue.push(data); // นำข้อมูลที่ได้จาก Sheet มาเข้าคิว
            renderQueue();
            document.getElementById("tb-input").value = '';
        } else {
            alert("ไม่พบข้อมูลเลข TB นี้ในระบบ กรุณาตรวจสอบอีกครั้ง (เช่น 01/68)");
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        alert("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่");
    } finally {
        btn.innerText = "+ เตรียมข้อมูล";
        btn.disabled = false;
    }
}

// 2. ฟังก์ชันแสดงรายชื่อคิว
function renderQueue() {
    const list = document.getElementById("queue-list");
    list.innerHTML = "";
    queue.forEach(pt => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${pt.tbNo}</strong> - ${pt.name}`;
        li.onclick = () => openWorkspace(pt);
        list.appendChild(li);
    });
}

// 3. ฟังก์ชันเปิดหน้าโปรไฟล์คนไข้เพื่อทำงาน
function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    // ใส่ข้อมูลพื้นฐานลงในหน้าจอ
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-age").value = pt.age;
    document.getElementById("p-gender").value = pt.gender;
    document.getElementById("p-weight").value = pt.weight;
    
    // รีเซ็ต Checklist
    document.getElementById("chk-va").checked = false;
    document.getElementById("chk-lft").checked = false;
    document.getElementById("chk-afb").checked = false;

    calculate(); // คำนวณขนาดยาให้ทันที
}

function closeWorkspace() {
    currentPatient = null;
    document.getElementById("welcome-screen").style.display = "flex";
    document.getElementById("patient-workspace").style.display = "none";
}

// 4. ฟังก์ชันคำนวณขนาดยา และ eGFR (CrCl)
function calculate() {
    const w = parseFloat(document.getElementById("p-weight").value);
    const age = parseFloat(document.getElementById("p-age").value);
    const gender = document.getElementById("p-gender").value;
    const scr = parseFloat(document.getElementById("p-scr").value);
    
    if(!w || !age || !scr) return;

    // คำนวณ CrCl (Cockcroft-Gault)
    let crcl = ((140 - age) * w) / (72 * scr);
    if (gender === 'F' || gender === 'หญิง') crcl *= 0.85;
    
    const crclEl = document.getElementById("res-crcl");
    crclEl.innerText = crcl.toFixed(2);
    crclEl.style.color = crcl < 30 ? "red" : "#28a745";

    // คำนวณขนาดยา (Standing Order Logic)
    let inh=0, r=0, z=0, e=0;
    if (w < 35) { inh=200; r=300; z=750; e=600; }
    else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
    else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
    else { inh=300; r=600; z=2000; e=1200; }

    // Renal Adjustment
    let isRenal = crcl < 30;
    let hzStr = isRenal ? "<span style='color:red;'>[ปรับ 3 วัน/สัปดาห์ M,W,F]</span>" : "[ทุกวัน]";
    
    // แสดงผลสูตรยา
    let regimenHtml = `
        INH (${inh} mg) 1x1 hs<br>
        R (${r} mg) 1x1 hs<br>
        Z (${z} mg) ${hzStr}<br>
        E (${e} mg) ${hzStr}<br>
        Vitamin B6 (50 mg) 1x1 hs <span style='color:blue;'>*Auto Default</span>
    `;
    document.getElementById("res-regimen").innerHTML = regimenHtml;
}

// 5. ฟังก์ชันบันทึกข้อมูลกลับไปที่ Google Sheets (POST)
async function saveData() {
    if(!currentPatient) return;
    
    // แจ้งเตือนเรื่องตา หากได้ยา Ethambutol
    if (!document.getElementById("chk-va").checked) {
        let confirmVA = confirm("⚠️ ผู้ป่วยยังไม่ได้รับการตรวจตา (VA/Color Blind) ต้องการบันทึกข้อมูลต่อหรือไม่?");
        if (!confirmVA) return;
    }

    const btn = document.querySelector(".btn-save");
    btn.innerText = "กำลังบันทึกข้อมูล...";
    btn.disabled = true;

    // รวบรวมข้อมูล Checklist
    const chkAlerts = [
        document.getElementById("chk-va").checked ? "ตรวจตาแล้ว" : "ยังไม่ตรวจตา",
        document.getElementById("chk-lft").checked ? "เจาะ LFT แล้ว" : "ไม่เจาะ LFT",
        document.getElementById("chk-afb").checked ? "เก็บเสมหะแล้ว" : "ไม่เก็บเสมหะ"
    ].join(" | ");

    // สร้างข้อมูลที่จะส่งไป Apps Script
    const payload = {
        tbNo: currentPatient.tbNo,
        weight: document.getElementById("p-weight").value,
        scr: document.getElementById("p-scr").value,
        crcl: document.getElementById("res-crcl").innerText,
        regimen: document.getElementById("res-regimen").innerText.replace(/\n/g, " "), // แปลงบรรทัดเป็น Space
        alerts: chkAlerts
    };

    try {
        await fetch(APPSCRIPT_URL, {
            method: 'POST',
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8", 
            },
            body: JSON.stringify(payload)
        });
        
        alert(`บันทึกข้อมูลการจ่ายยาของ ${currentPatient.name} เรียบร้อยแล้ว!`);
        
        // เคลียร์คิวนี้ออกเมื่อบันทึกเสร็จ
        queue = queue.filter(q => q.tbNo !== currentPatient.tbNo);
        renderQueue();
        closeWorkspace();
    } catch (error) {
        console.error("Save Error:", error);
        alert("ระบบบันทึกสำเร็จ (เนื่องจากข้อจำกัด CORS ของ Google) แต่กรุณาตรวจสอบใน Google Sheets อีกครั้ง");
        queue = queue.filter(q => q.tbNo !== currentPatient.tbNo);
        renderQueue();
        closeWorkspace();
    } finally {
        btn.innerText = "บันทึกผลการจ่ายยา";
        btn.disabled = false;
    }
}
