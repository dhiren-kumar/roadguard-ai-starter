require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./backend/src/config/db");

const authRoutes = require("./backend/src/routes/auth");
const reportRoutes = require("./backend/src/routes/reports");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",").map(value => value.trim()) : true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many authentication attempts. Please try again later." }
});

app.get("/api/health", (req, res) => res.json({ success: true, service: "RoadGuard AI API" }));
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/reports", reportRoutes);
app.use(express.static(path.join(__dirname)));

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use((error, req, res, next) => {
    console.error("Unhandled server error:", error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ success: false, message: "Internal server error." });
});

async function start() {
    try {
        await connectDB();
        app.listen(PORT, () => console.log(`RoadGuard AI server listening on port ${PORT}`));
    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

if (require.main === module) start();
module.exports = { app, start };
