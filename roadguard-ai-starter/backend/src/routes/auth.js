
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const sendEmail = require("../utils/email");
const { protect } = require("../middleware/auth");

const router = express.Router();

// ============================================
// 1. CONTRIBUTOR REGISTRATION
// POST /api/auth/register
// ============================================

router.post("/register", async (req, res) => {
    try {
        const { name, email, password, locationText } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered."
            });
        }

        // Generate verification token
        const verificationToken = crypto
            .randomBytes(32)
            .toString("hex");

        const verificationHash = crypto
            .createHash("sha256")
            .update(verificationToken)
            .digest("hex");

        // Create contributor
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            passwordHash: await bcrypt.hash(password, 12),
            locationText: locationText || "",
            role: "contributor",
            isEmailVerified: false,
            emailVerificationTokenHash: verificationHash,
            emailVerificationExpires: new Date(
                Date.now() + 30 * 60 * 1000
            )
        });

        // Send verification email
        try {
            await sendEmail(
                user.email,
                user.name,
                verificationToken
            );
        } catch (emailError) {
            await User.findByIdAndDelete(user._id);
            console.error("Email error:", emailError);
            return res.status(500).json({
                success: false,
                message: "Unable to send verification email."
            });
        }

        return res.status(201).json({
            success: true,
            message: "Registration successful. Please verify your email."
        });

    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Registration failed."
        });
    }
});


// ============================================
// 2. VERIFY EMAIL
// GET /api/auth/verify-email?token=...
// ============================================

router.get("/verify-email", async (req, res) => {
    try {
        const token = String(req.query.token || "");

        if (!token) {
            return res.status(400).send(
                "Verification token is missing."
            );
        }

        const verificationHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const user = await User.findOne({
            emailVerificationTokenHash: verificationHash,
            emailVerificationExpires: {
                $gt: new Date()
            }
        });

        if (!user) {
            return res.status(400).send(
                "Invalid or expired verification link."
            );
        }

        user.isEmailVerified = true;
        user.emailVerificationTokenHash = null;
        user.emailVerificationExpires = null;

        await user.save();

        return res.send(
            "Email verified successfully. You can now log in."
        );

    } catch (error) {
        console.error("Verification error:", error);

        return res.status(500).send(
            "Email verification failed."
        );
    }
});


// ============================================
// 3. USER LOGIN
// POST /api/auth/login
// ============================================

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const passwordMatched = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatched) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        if (!user.isEmailVerified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email first."
            });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is missing in .env");
        }

        const token = jwt.sign(
            {
                sub: user._id.toString(),
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "7d"
            }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                locationText: user.locationText
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed."
        });
    }
});


// ============================================
// 4. GET CURRENT USER PROFILE
// GET /api/auth/me
// ============================================

router.get("/me", protect, async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                role: req.user.role,
                locationText: req.user.locationText
            }
        });

    } catch (error) {
        console.error("Profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch user profile."
        });
    }
});


// ============================================
// 5. EXPORT ROUTER
// ============================================

module.exports = router;
