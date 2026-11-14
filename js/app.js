const user = JSON.parse(localStorage.getItem('user'));
if (!user || user.role !== 'contributor') {
    window.location.href = 'login.html';
}

const welcomeEl = document.getElementById('userWelcome');
if (welcomeEl && user) {
<<<<<<< HEAD
    welcomeEl.innerText = `${user.name} (${user.email || 'Contributor'})`;
=======
    welcomeEl.innerText = `${user.name} (${user.location || 'Contributor'})`;
>>>>>>> a1478bd32f610091024a60994b907f1ce0b4ff0e
}

const video = document.getElementById('cam');
const canvas = document.getElementById('canvas');
const log = document.getElementById('logBox');
const aiBadge = document.getElementById('aiBadge');

let coords = { lat: null, lng: null };
let ortSession = null;
const MODEL_SIZE = 640;
const DAMAGE_CLASSES = ['Longitudinal Crack', 'Transverse Crack', 'Alligator Crack', 'Pothole'];

<<<<<<< HEAD
// 1. Live GPS Tracking
=======
// 1. Live GPS Location
>>>>>>> a1478bd32f610091024a60994b907f1ce0b4ff0e
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        pos => {
            coords.lat = pos.coords.latitude;
            coords.lng = pos.coords.longitude;
            if (log) log.innerText = `GPS Locked: [${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}]`;
        },
        () => { if (log) log.innerText = 'GPS permission denied or unavailable.'; },
        { enableHighAccuracy: true }
    );
}


<<<<<<< HEAD
// 2. Load Model into Local Device RAM
=======
// 2. Load Model Into Local Device RAM
>>>>>>> a1478bd32f610091024a60994b907f1ce0b4ff0e
async function initEdgeAI() {
    try {
        ortSession = await ort.InferenceSession.create('./model/best.onnx', {
            executionProviders: ['wasm']
        });
        if (aiBadge) aiBadge.innerText = 'Edge AI Ready: Running 100% locally in device RAM';
        runLiveEdgeLoop();
    } catch (err) {
        console.error('Edge AI Load Error:', err);
        if (aiBadge) aiBadge.innerText = 'Edge AI Error: Ensure model/best.onnx is uploaded.';
    }
}

// 3. Start Camera & Local Edge AI
async function startCamera() {
    if (!video) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.onloadeddata = () => initEdgeAI();
    } catch (err) {
        if (log) log.innerText = 'Camera blocked. Use localhost or HTTPS.';
    }
}
startCamera();

// 4. Local Frame Inference (Zero Cloud Video Streaming)
async function analyzeFrameLocally() {
    if (!ortSession || !video || video.readyState < 2) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = MODEL_SIZE;
    offscreen.height = MODEL_SIZE;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0, MODEL_SIZE, MODEL_SIZE);
    const { data } = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);

    const floatData = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
    const area = MODEL_SIZE * MODEL_SIZE;
    for (let i = 0; i < area; i++) {
        floatData[i] = data[i * 4] / 255.0;
        floatData[i + area] = data[i * 4 + 1] / 255.0;
        floatData[i + 2 * area] = data[i * 4 + 2] / 255.0;
    }

    const inputTensor = new ort.Tensor('float32', floatData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const results = await ortSession.run({ [ortSession.inputNames[0]]: inputTensor });
    const output = results[ortSession.outputNames[0]].data;

    let maxConf = 0;
    let bestIdx = 0;
    const numClasses = DAMAGE_CLASSES.length;
    const numBoxes = output.length / (4 + numClasses);

    for (let b = 0; b < numBoxes; b++) {
        for (let c = 0; c < numClasses; c++) {
            const score = output[(4 + c) * numBoxes + b];
            if (score > maxConf) {
                maxConf = score;
                bestIdx = c;
            }
        }
    }

    return { label: DAMAGE_CLASSES[bestIdx] || 'Road Damage', confidence: maxConf };
}

function runLiveEdgeLoop() {
    setInterval(async () => {
        const res = await analyzeFrameLocally();
        if (!res) return;

        const pct = (res.confidence * 100).toFixed(1);
        const severitySelect = document.getElementById('severitySelect');

        if (res.confidence > 0.55) {
            if (aiBadge) aiBadge.innerText = `Local AI: ${res.label} (${pct}%)`;
            if (severitySelect) {
                severitySelect.value = res.confidence > 0.80 ? 'Severe' : 'Medium';
            }
        } else {
            if (aiBadge) aiBadge.innerText = 'Scanning locally on device RAM... (Road clear)';
        }
    }, 1200);
}

<<<<<<< HEAD
// 5. Send Snapshot & Metadata to Backend
=======
// 5. Send Only Metadata + Snapshot to Backend
>>>>>>> a1478bd32f610091024a60994b907f1ce0b4ff0e
async function captureAndReport() {
    if (!coords.lat || !coords.lng) {
        alert('Waiting for GPS lock. Please allow location access.');
        return;
    }

    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (video && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    const imageBase64 = canvas.toDataURL('image/jpeg', 0.6);
    const severity = document.getElementById('severitySelect').value;

    try {
        const res = await fetch('/api/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contributor_email: user.email,
                latitude: coords.lat,
                longitude: coords.lng,
                severity: severity,
                image_base64: imageBase64
            })
        });
        const data = await res.json();
        alert(data.message || data.error);
        if (data.success && log) {
            log.innerText = 'Report submitted to backend. Pending admin approval.';
        }
    } catch (err) {
        alert('Server error while submitting report.');
    }
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
<<<<<<< HEAD

    async function loadHomeReports() {
    try {
        const response = await fetch('/api/reports');
        const reports = await response.json();
        
        const grid = document.getElementById('reports-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (reports.length === 0) {
            grid.innerHTML = '<p>No recent reports found.</p>';
            return;
        }

        reports.slice(0, 6).forEach(report => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.style.cssText = 'background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
            
            card.innerHTML = `
                <h4 style="margin: 0 0 10px 0; color: #333;">${report.title || 'Hazard Report'}</h4>
                <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">${report.description || 'No description provided.'}</p>
                <small style="color: #999;">Status: <b>${report.status || 'Pending'}</b></small>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to load reports for home page:', error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadHomeReports();
});
}
=======
}
>>>>>>> a1478bd32f610091024a60994b907f1ce0b4ff0e
