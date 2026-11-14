const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match) {
        return res.status(401).json({ success: false, message: "Authentication required. Sign in and send a Bearer token." });
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        console.error("JWT_SECRET is missing or too short.");
        return res.status(503).json({ success: false, message: "Authentication is not configured on the server." });
    }

    try {
        const decoded = jwt.verify(match[1], process.env.JWT_SECRET, {
            issuer: "roadguard-ai",
            audience: "roadguard-ai-client"
        });
        const user = await User.findById(decoded.sub).select("-passwordHash -emailVerificationTokenHash -emailVerificationExpires");
        if (!user || !user.isEmailVerified) {
            return res.status(401).json({ success: false, message: "Account is unavailable. Please sign in again." });
        }
        req.user = user;
        return next();
    } catch (error) {
        if (error.name !== "JsonWebTokenError" && error.name !== "TokenExpiredError") {
            console.error("Authentication middleware error:", error);
        }
        return res.status(401).json({ success: false, message: "Invalid or expired login token." });
    }
};

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ success: false, message: "Admin access required." });
    }
    return next();
};

const contributorOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "contributor") {
        return res.status(403).json({ success: false, message: "Contributor access required." });
    }
    return next();
};

module.exports = { protect, adminOnly, contributorOnly };
