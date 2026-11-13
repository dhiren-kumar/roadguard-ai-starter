const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Serve all frontend files (index.html, login.html, dashboard.html, admin.html, js/, css/)
app.use(express.static(__dirname));

// In-memory store with pre-seeded demo accounts so login works immediately
const users = [
    {
        name: 'System Admin',
        email: 'admin@roadguard.local',
        password: 'RoadGuard@123',
        location: 'Bhubaneswar',
        role: 'admin',
        verified: true
    },
    {
        name: 'Demo Contributor',
        email: 'user@roadguard.local',
        password: 'User@123',
        location: 'Bhubaneswar',
        role: 'contributor',
        verified: true
    }
];

const reports = [
    {
        id: 1,
        contributor_email: 'user@roadguard.local',
        latitude: 20.2961,
        longitude: 85.8245,
        severity: 'Severe',
        status: 'approved',
        image_base64: 'https://placehold.co/300x200/ef4444/white?text=Pothole+Bhubaneswar',
        timestamp: new Date().toLocaleString()
    }
];

// Register Contributor
app.post('/api/register', (req, res) => {
    const { name, email, password, location } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (users.some(u => u.email === normalizedEmail)) {
        return res.status(400).json({ success: false, error: 'Email already registered. Please log in.' });
    }

    const newUser = {
        name: name.trim(),
        email: normalizedEmail,
        password,
        location: location || 'Unknown',
        role: 'contributor',
        verified: true
    };
    users.push(newUser);

    res.json({ success: true, message: 'Registration successful! You can now log in.', user: newUser });
});

// Login (Supports both Contributor and Admin)
app.post('/api/login', (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email === normalizedEmail && u.password === password);

    if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    if (role && user.role !== role) {
        return res.status(403).json({ success: false, error: `This account is registered as ${user.role}, not ${role}.` });
    }

    res.json({
        success: true,
        user: {
            name: user.name,
            email: user.email,
            role: user.role,
            location: user.location
        }
    });
});

// Get Approved/Active Reports for Public Map
app.get('/api/reports/public', (req, res) => {
    res.json(reports.filter(r => r.status !== 'pending'));
});

// Get All Reports for Admin Dashboard
app.get('/api/reports/admin', (req, res) => {
    res.json(reports);
});

// Submit New Road Damage Report (With ~10m Duplicate Protection)
app.post('/api/reports', (req, res) => {
    const { contributor_email, latitude, longitude, severity, image_base64 } = req.body;

    if (latitude == null || longitude == null) {
        return res.status(400).json({ success: false, error: 'GPS coordinates are required.' });
    }

    const threshold = 0.0001;
    const duplicate = reports.find(r =>
        Math.abs(r.latitude - latitude) < threshold &&
        Math.abs(r.longitude - longitude) < threshold &&
        r.status !== 'resolved'
    );

    if (duplicate) {
        return res.status(200).json({
            success: false,
            message: 'Duplicate location detected: an unresolved report already exists here and will not be overwritten.'
        });
    }

    const newReport = {
        id: Date.now(),
        contributor_email: contributor_email || 'anonymous',
        latitude: Number(latitude),
        longitude: Number(longitude),
        severity: severity || 'Medium',
        image_base64: image_base64 || '',
        status: 'pending',
        timestamp: new Date().toLocaleString()
    };

    reports.unshift(newReport);
    res.json({ success: true, reportId: newReport.id, message: 'Report submitted for admin approval.' });
});

// Admin Update Report Status
app.put('/api/reports/:id', (req, res) => {
    const { status } = req.body;
    const report = reports.find(r => String(r.id) === String(req.params.id));

    if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found.' });
    }

    report.status = status;
    res.json({ success: true, message: `Report status updated to ${status}.` });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`RoadGuard server running at http://localhost:${PORT}`);
});
