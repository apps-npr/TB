// นำ Web App URL ของคุณมาใส่ที่นี่
const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyBiiRMfeFJixkuesIyyEptEN5K806lUeYvB4l5IK2x6x_cXUPsidsW5hZF0zTzUcQI/exec"; 

let queue = [];
let currentPatient = null;

// จำลองฐานข้อมูล หากยังไม่ได้ต่อ API (สำหรับทดสอบ)
const mockDB = {
    "01/68": { hn: "12345/68", name: "สมชาย รักษาดี", age: 45, gender: "M", weight: 55 },
    "02/68": { hn: "98765/68", name: "สมศรี หายไว", age: 62, gender: "F", weight: 42 }
};

function addToQueue() {
    const tbNo = document.getElementById("tb-input").value.trim();
    if (!tbNo) return;
    
    // ตรงนี้ในของจริงสามารถ fetch(APPSCRIPT_URL + "?tbNo=" + tbNo) ได้
    // แต่สำหรับตัวต้นแบบจะดึงจาก mockDB ก่อนเพื่อความรวดเร็ว
    const pt = mockDB[tbNo]; 
    if (pt) {
        if(!queue.find(q => q.tbNo === tbNo)) {
            pt.tbNo = tbNo;
            queue.push(pt);
            renderQueue();
            document.getElementById("tb-input").value = '';
        } else { alert("คิวนี้ถูกเพิ่มไปแล้ว"); }
    } else {
        alert("ไม่พบข้อมูลเลข TB นี้ในระบบ");
    }
}

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

function openWorkspace(pt) {
    currentPatient = pt;
    document.getElementById("welcome-screen").style.display = "none";
    document.getElementById("patient-workspace").style.display = "block";
    
    document.getElementById("p-tbno").innerText = pt.tbNo;
    document.getElementById("p-hn").innerText = pt.hn;
    document.getElementById("p-name").innerText = pt.name;
    document.getElementById("p-age").value = pt.age;
    document.getElementById("p-gender").value = pt.gender;
    document.getElementById("p-weight").value = pt.weight;
    
    calculate(); // คำนวณยาให้ทันทีที่เปิด
}

function closeWorkspace() {
    currentPatient = null;
    document.getElementById("welcome-screen").style.display = "flex";
    document.getElementById("patient-workspace").style.display = "none";
}

function calculate() {
    const w = parseFloat(document.getElementById("p-weight").value);
    const age = parseFloat(document.getElementById("p-age").value);
    const gender = document.getElementById("p-gender").value;
    const scr = parseFloat(document.getElementById("p-scr").value);
    
    if(!w || !age || !scr) return;

    // 1. คำนวณ CrCl (Cockcroft-Gault)
    let crcl = ((140 - age) * w) / (72 * scr);
    if (gender === 'F') crcl *= 0.85;
    
    const crclEl = document.getElementById("res-crcl");
    crclEl.innerText = crcl.toFixed(2);
    crclEl.style.color = crcl < 30 ? "red" : "#28a745";

    // 2. คำนวณขนาดยา (Standing Order Logic)
    let inh=0, r=0, z=0, e=0;
    if (w < 35) { inh=200; r=300; z=750; e=600; }
    else if (w <= 49) { inh=300; r=450; z=1000; e=800; }
    else if (w <= 69) { inh=300; r=600; z=1500; e=1000; }
    else { inh=300; r=600; z=2000; e=1200; }

    // 3. Renal Adjustment
    let isRenal = crcl < 30;
    let hzStr = isRenal ? "<span style='color:red;'>[ปรับ 3 วัน/สัปดาห์ M,W,F]</span>" : "[ทุกวัน]";
    
    // แจ้งเตือนเรื่องตา หากได้ยา Ethambutol
    if (!document.getElementById("chk-va").checked) {
        alert("⚠️ ห้ามลืม! ผู้ป่วยต้องได้รับการตรวจ VA และ Color Blind ก่อนเริ่มยา Ethambutol");
    }

    // 4. แสดงผล
    let regimenHtml = `
        INH (${inh} mg) 1x1 hs<br>
        R (${r} mg) 1x1 hs<br>
        Z (${z} mg) ${hzStr}<br>
        E (${e} mg) ${hzStr}<br>
        Vitamin B6 (50 mg) 1x1 hs <span style='color:blue;'>*Auto Default</span>
    `;
    document.getElementById("res-regimen").innerHTML = regimenHtml;
}

function saveData() {
    if(!currentPatient) return;
    
    // โค้ดสำหรับส่งกลับไปที่ AppScript (POST)
    /*
    fetch(APPSCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
            tbNo: currentPatient.tbNo,
            weight: document.getElementById("p-weight").value,
            scr: document.getElementById("p-scr").value,
            crcl: document.getElementById("res-crcl").innerText,
            regimen: "Saved", // ส่งข้อความสูตรยาที่คำนวณแล้วไปเก็บ
            alerts: "VA:" + document.getElementById("chk-va").checked
        })
    }).then(() => alert("บันทึกข้อมูลเรียบร้อย"));
    */
    
    // จำลองการบันทึก
    alert(`บันทึกข้อมูลและสูตรยาของ ${currentPatient.name} เรียบร้อยแล้ว!`);
    
    // เอาออกจากคิวเมื่อทำเสร็จ
    queue = queue.filter(q => q.tbNo !== currentPatient.tbNo);
    renderQueue();
    closeWorkspace();
}
