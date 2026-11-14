const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const sendEmail = require("../utils/email");
const { protect } = require("../middleware/auth");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createVerificationHash(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const locationText = typeof req.body.locationText === "string" ? req.body.locationText.trim().slice(0, 200) : "";

        if (!name || name.length > 100 || !EMAIL_RE.test(email) || !password) {
            return res.status(400).json({ success: false, message: "Enter a valid name, email and password." });
        }
        if (password.length < 8 || password.length > 72) {
            return res.status(400).json({ success: false, message: "Password must be between 8 and 72 characters." });
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const user = await User.create({
            name,
            email,
            passwordHash: await bcrypt.hash(password, 12),
            locationText,
            role: "contributor",
            isEmailVerified: false,
            emailVerificationTokenHash: createVerificationHash(verificationToken),
            emailVerificationExpires: new Date(Date.now() + 30 * 60 * 1000)
        });

        const apiBase = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
        const verificationUrl = `${apiBase}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
        const html = `<p>Hello ${name.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))},</p>
            <p>Verify your RoadGuard AI account using the link below. This link expires in 30 minutes.</p>
            <p><a href="${verificationUrl}">Verify email address</a></p>`;
        try {
            await sendEmail(email, "Verify your RoadGuard AI account", html);
        } catch (emailError) {
            await User.findByIdAndDelete(user._id);
            console.error("Verification email could not be sent:", emailError.message);
            return res.status(503).json({ success: false, message: "Verification email could not be sent. Check the server email configuration and try again." });
        }

        return res.status(201).json({ success: true, message: "Registration successful. Check your email to verify your account." });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(409).json({ success: false, message: "That email address is already registered." });
        }
        console.error("Registration error:", error);
        return res.status(500).json({ success: false, message: "Registration failed." });
    }
});

// GET /api/auth/verify-email?token=...
router.get("/verify-email", async (req, res) => {
    try {
        const token = typeof req.query.token === "string" ? req.query.token : "";
        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).send("Invalid or expired verification link.");
        }
        const user = await User.findOne({
            emailVerificationTokenHash: createVerificationHash(token),
            emailVerificationExpires: { $gt: new Date() }
        });
        if (!user) return res.status(400).send("Invalid or expired verification link.");

        user.isEmailVerified = true;
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();
        return res.send("Email verified successfully. You can now sign in to RoadGuard AI.");
    } catch (error) {
        console.error("Email verification error:", error);
        return res.status(500).send("Email verification failed. Please try again.");
    }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body.password === "string" ? req.body.password : "";
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }
        const user = await User.findOne({ email });
        const passwordMatched = user ? await bcrypt.compare(password, user.passwordHash) : false;
        if (!passwordMatched) {
            return res.status(401).json({ success: false, message: "Invalid email or password." });
        }
        if (!user.isEmailVerified) {
            return res.status(403).json({ success: false, message: "Please verify your email before signing in." });
        }
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            console.error("JWT_SECRET must be configured with at least 32 characters.");
            return res.status(503).json({ success: false, message: "Authentication is not configured on the server." });
        }

        const token = jwt.sign(
            { sub: user._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || "2h", issuer: "roadguard-ai", audience: "roadguard-ai-client" }
        );
        return res.json({
            success: true,
            message: "Login successful.",
            token,
            expiresIn: process.env.JWT_EXPIRES_IN || "2h",
            user: { id: user._id, name: user.name, email: user.email, role: user.role, locationText: user.locationText }
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({ success: false, message: "Login failed." });
    }
});

// GET /api/auth/me
router.get("/me", protect, (req, res) => {
    res.json({
        success: true,
        user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role, locationText: req.user.locationText }
    });
});

module.exports = router;
