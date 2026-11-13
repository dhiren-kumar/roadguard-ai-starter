const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Initialize SQLite Database
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to the SQLite database.');
});

// Create Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        location TEXT,
        role TEXT,
        verified INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contributor_email TEXT,
        latitude REAL,
        longitude REAL,
        severity TEXT,
        image_base64 TEXT,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Register Endpoint
app.post('/api/register', (req, res) => {
    const { name, email, password, location, role } = req.body;
    const userRole = role || 'contributor';
    const verified = userRole === 'admin' ? 1 : 0;

    db.run(
        `INSERT INTO users (name, email, password, location, role, verified) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, email, password, location, userRole, verified],
        function (err) {
            if (err) {
                return res.status(400).json({ error: 'Email already registered or invalid data.' });
            }
            res.json({ success: true, userId: this.lastID, message: 'Registration successful.' });
        }
    );
});

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { email, password, role } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? AND role = ?`, [email, role], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid credentials or role mismatch.' });
        }
        if (user.password !== password) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }
        res.json({ success: true, user: { name: user.name, email: user.email, role: user.role, location: user.location } });
    });
});

// Submit Road Damage Report with Duplicate Spatial Guard
app.post('/api/reports', (req, res) => {
    const { contributor_email, latitude, longitude, severity, image_base64 } = req.body;
    const threshold = 0.0001; // ~10 meters proximity check

    db.get(
        `SELECT id, status FROM reports WHERE ABS(latitude - ?) < ? AND ABS(longitude - ?) < ? AND status NOT IN ('resolved')`,
        [latitude, threshold, longitude, threshold],
        (err, existingReport) => {
            if (existingReport) {
                return res.status(200).json({ 
                    success: false, 
                    message: 'Duplicate location detected. Active report exists; AI will not overwrite.' 
                });
            }

            db.run(
                `INSERT INTO reports (contributor_email, latitude, longitude, severity, image_base64, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
                [contributor_email, latitude, longitude, severity, image_base64],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, reportId: this.lastID, message: 'Report submitted successfully for admin review.' });
                }
            );
        }
    );
});

// Get Public Reports (Approved / Under Construction / Resolved)
app.get('/api/reports/public', (req, res) => {
    db.all(`SELECT * FROM reports WHERE status != 'pending'`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get All Reports for Admin
app.get('/api/reports/admin', (req, res) => {
    db.all(`SELECT * FROM reports ORDER BY timestamp DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Report Status
app.put('/api/reports/:id', (req, res) => {
    const { status } = req.body;
    const reportId = req.params.id;
    db.run(`UPDATE reports SET status = ? WHERE id = ?`, [status, reportId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: `Status updated to ${status}` });
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`RoadGuard AI Server running on port ${PORT}`));