const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

let reports = [];
const verificationCodes = {};

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',         // Replace with your email
        pass: 'your-email-app-password'       // Replace with your Gmail App Password
    }
});

// Email Verification: Send OTP
app.post('/api/auth/send-verification', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[email] = { otp, expires: Date.now() + 10 * 60 * 1000 };

    try {
        await transporter.sendMail({
            from: '"RoadGuard AI" <your-email@gmail.com>',
            to: email,
            subject: 'RoadGuard AI - Email Verification Code',
            text: `Your verification code is: ${otp}. Valid for 10 minutes.`
        });
        res.json({ success: true, message: 'Verification code sent successfully!' });
    } catch (err) {
        console.error('Email send error:', err);
        res.status(500).json({ error: 'Failed to send email. Check SMTP credentials.' });
    }
});

// Email Verification: Verify OTP
app.post('/api/auth/verify-code', (req, res) => {
    const { email, code } = req.body;
    const record = verificationCodes[email];

    if (!record) return res.status(400).json({ error: 'No verification request found.' });
    if (Date.now() > record.expires) {
        delete verificationCodes[email];
        return res.status(400).json({ error: 'Verification code has expired.' });
    }

    if (record.otp === code) {
        delete verificationCodes[email];
        res.json({ success: true, message: 'Email verified successfully!' });
    } else {
        res.status(400).json({ error: 'Invalid verification code.' });
    }
});

// Get Pending Reports for Admin
app.get('/api/reports', (req, res) => {
    res.json(reports);
});

// Get Public Reports (Excludes 'pending', shows Approved, Under Construction, Resolved)
app.get('/api/reports/public', (req, res) => {
    res.json(reports.filter(r => r.status !== 'pending'));
});

// Submit Report from Edge AI App (with Proximity Check)
app.post('/api/reports', (req, res) => {
    const { contributor_email, latitude, longitude, severity, image_base64 } = req.body;
    if (!latitude || !longitude || !image_base64) {
        return res.status(400).json({ success: false, error: 'Missing required report fields.' });
    }

    // Proximity check (~10m duplicate prevention)
    const duplicate = reports.find(r => 
        r.status !== 'resolved' &&
        Math.abs(r.latitude - latitude) < 0.0001 &&
        Math.abs(r.longitude - longitude) < 0.0001
    );

    if (duplicate) {
        return res.json({ success: false, message: 'Report already exists nearby. Ignored duplicate.' });
    }

    const newReport = {
        id: Date.now().toString(),
        contributor_email: contributor_email || 'anonymous@roadguard.local',
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        severity: severity || 'Medium',
        image_base64,
        status: 'pending',
        timestamp: new Date().toISOString()
    };

    reports.push(newReport);
    res.json({ success: true, message: 'Report submitted successfully and sent to Admin!' });
});

// Admin Update Report Status
app.patch('/api/reports/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const report = reports.find(r => r.id === id);

    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (status) report.status = status;

    res.json({ success: true, message: `Report status updated to ${status}` });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));