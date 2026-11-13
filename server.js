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
<<<<<<< HEAD
app.listen(PORT, () => console.log(`RoadGuard AI Server running on port ${PORT}`));
=======

// ======================================================
// CORS CONFIGURATION
// Development configuration: allows local frontend
// and devices on your local network.
// Restrict origins before production deployment.
// ======================================================

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// ======================================================
// BODY PARSING
// ======================================================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));

// ======================================================
// UPLOADS FOLDER
// ======================================================

const uploadDirectory = path.join(__dirname, "../uploads");

// Create uploads folder if it does not exist
if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, { recursive: true });
}

// Make uploaded images publicly accessible
app.use(
    "/uploads",
    express.static(uploadDirectory)
);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "RoadGuard AI backend is running."
    });
});

app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "RoadGuard AI API is working.",
        database:
            require("mongoose").connection.readyState === 1
                ? "Connected"
                : "Disconnected",
        timestamp: new Date().toISOString()
    });
});

// ======================================================
// API ROUTES
// ======================================================

app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);

// ======================================================
// NOT FOUND HANDLER
// ======================================================

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API route not found.",
        path: req.originalUrl
    });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {
    console.error("Backend Error:", error.message);

    if (error.name === "MulterError") {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    if (error.message &&
        error.message.includes("Only JPG")) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    const statusCode = error.statusCode || 500;

    res.status(statusCode).json({
        success: false,
        message:
            statusCode === 500
                ? "Internal server error."
                : error.message
    });
});

// ======================================================
// START SERVER AFTER DATABASE CONNECTION
// ======================================================

async function startServer() {
    try {
        console.log("");
        console.log("================================");
        console.log("       ROADGUARD AI SERVER");
        console.log("================================");

        console.log("Connecting to MongoDB Atlas...");

        // Connect to MongoDB first
        await connectDB();

        // Start server after successful DB connection
        app.listen(PORT, "0.0.0.0", () => {
            console.log("");
            console.log("================================");
            console.log("RoadGuard AI Server Started!");
            console.log("================================");
            console.log(`Local: http://localhost:${PORT}`);
            console.log(`Health: http://localhost:${PORT}/api/health`);
            console.log("");
            console.log("Authentication: /api/auth");
            console.log("Reports:        /api/reports");
            console.log("Uploads:        /uploads");
            console.log("================================");
            console.log("");
        });

    } catch (error) {
        console.error("");
        console.error("================================");
        console.error("SERVER STARTUP FAILED");
        console.error("================================");
        console.error(error.message);
        console.error("");
        console.error("Check your MongoDB Atlas connection,");
        console.error("IP Access List and .env configuration.");
        console.error("================================");

        process.exit(1);
    }

    
}

// Start application
startServer();
>>>>>>> f811e09f1103b8f1f1a95e5340fd8e27f55df2d4
