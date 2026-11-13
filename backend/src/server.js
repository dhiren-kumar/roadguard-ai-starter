
// ======================================================
// ROADGUARD AI - BACKEND SERVER
// File: backend/src/server.js
// ======================================================

// Load environment variables from backend/.env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

// Database connection
const connectDB = require("./config/db");

// API routes
const authRoutes = require("./routes/auth");
const reportRoutes = require("./routes/reports");

// Initialize Express
const app = express();

// ======================================================
// BASIC CONFIGURATION
// ======================================================

const PORT = process.env.PORT || 5000;

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
