const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(__dirname));

let reports = [];

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

app.get('/api/reports', (req, res) => {
    res.json(reports);
});

app.get('/api/reports/public', (req, res) => {
    res.json(reports.filter(r => r.status !== 'pending'));
});

app.post('/api/reports', async (req, res) => {
    const { contributor_name, contributor_phone, latitude, longitude, severity, damage_type, image_base64 } = req.body;
    
    if (!latitude || !longitude || !image_base64) {
        return res.status(400).json({ success: false, error: 'Missing GPS or image payload.' });
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    const duplicate = reports.find(r => 
        r.status !== 'completed' &&
        getDistanceFromLatLonInMeters(r.latitude, r.longitude, lat, lon) < 25
    );

    if (duplicate) {
        return res.json({ 
            success: false, 
            duplicate: true, 
            message: 'Duplicate report ignored: A road issue was already reported nearby.' 
        });
    }

    let locationName = 'Unknown Road / Area';
    try {
        const fetch = (await import('node-fetch')).default;
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const geoData = await geoRes.json();
        if (geoData && geoData.display_name) {
            locationName = geoData.display_name;
        }
    } catch (e) {
        console.log('Reverse geocode fallback used');
    }

    const newReport = {
        id: 'rep_' + Date.now(),
        contributor_name: contributor_name || 'Anonymous',
        contributor_phone: contributor_phone || 'N/A',
        latitude: lat,
        longitude: lon,
        location_name: locationName,
        severity: severity || 'Medium',
        damage_type: damage_type || 'Road Damage',
        image_base64,
        status: 'pending',
        timestamp: new Date().toISOString()
    };

    reports.unshift(newReport);
    res.json({ success: true, message: 'Report successfully submitted to Admin queue!' });
});

app.patch('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const report = reports.find(r => r.id === id);

    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (status) report.status = status;

    res.json({ success: true, message: `Report status updated to ${status}` });
});

app.listen(PORT, () => console.log(`RoadGuard server running on port ${PORT}`));
