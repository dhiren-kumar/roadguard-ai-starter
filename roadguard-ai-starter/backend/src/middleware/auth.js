
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// =====================================
// AUTHENTICATION MIDDLEWARE
// =====================================

const protect = async (req, res, next) => {
    try {
        // 1. Get authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Access denied. Please login first."
            });
        }

        // 2. Extract JWT token
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token missing."
            });
        }

        // 3. Verify token
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing from .env");
            return res.status(500).json({
                success: false,
                message: "Server authentication configuration error."
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // 4. Find user in database
        const user = await User.findById(decoded.sub)
            .select("-passwordHash");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account not found."
            });
        }

        // 5. Attach user to request
        req.user = user;

        // 6. Continue to route
        return next();

    } catch (error) {
        console.error("Protect middleware error:", error.message);

        return res.status(401).json({
            success: false,
            message: "Invalid or expired login token."
        });
    }
};


// =====================================
// ADMIN AUTHORIZATION MIDDLEWARE
// =====================================

const adminOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Admin access required."
        });
    }

    next();
};


// =====================================
// CONTRIBUTOR AUTHORIZATION
// =====================================

const contributorOnly = (req, res, next) => {
    if (!req.user || req.user.role !== "contributor") {
        return res.status(403).json({
            success: false,
            message: "Contributor access required."
        });
    }

    next();
};


// =====================================
// EXPORT MIDDLEWARE
// =====================================

module.exports = {
    protect,
    adminOnly,
    contributorOnly
};
