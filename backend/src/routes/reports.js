const express = require("express");
const mongoose = require("mongoose");
const Report = require("../models/Report");
const { protect, adminOnly } = require("../middleware/auth");
const { configureCloudinary } = require("../config/cloudinary");

const router = express.Router();
const STATUSES = ["pending", "approved", "under-construction", "resolved", "rejected"];
const SEVERITIES = ["low", "medium", "high"];

function present(report) {
    const r = report.toObject ? report.toObject() : report;
    return {
        id: r._id,
        damage_type: r.damageType,
        severity: r.severity,
        description: r.description,
        status: r.status,
        latitude: r.location.coordinates[1],
        longitude: r.location.coordinates[0],
        location_name: r.locationName || `${r.location.coordinates[1]}, ${r.location.coordinates[0]}`,
        image_base64: r.imageUrl,
        image_url: r.imageUrl,
        contributor_name: r.contributorName || (r.submittedBy && r.submittedBy.name) || "Contributor",
        contributor_phone: r.contributorPhone || "",
        contributor_email: r.contributorEmail || "",
        contributor_location: r.contributorLocation || "",
        timestamp: r.createdAt
    };
}

// Public map: only reports approved for public viewing.
router.get("/public", async (req, res) => {
    try {
        // Keep the public map response small: latest 100 visible reports only.
        // Exclude contributor details and fields not used by the public page.
        const reports = await Report.find({
            status: { $in: ["approved", "under-construction", "resolved"] }
        })
            .select("_id damageType severity status location locationName imageUrl createdAt")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=45");
        return res.json(reports.map(r => ({
            id: r._id,
            damage_type: r.damageType,
            severity: r.severity,
            status: r.status,
            latitude: r.location.coordinates[1],
            longitude: r.location.coordinates[0],
            location_name: r.locationName || `${r.location.coordinates[1]}, ${r.location.coordinates[0]}`,
            image_url: r.imageUrl,
            timestamp: r.createdAt
        })));
    } catch (error) {
        console.error("Public reports error:", error);
        return res.status(500).json({ success: false, message: "Unable to load public reports." });
    }
});

// Admin queue: authentication and role are checked on the server.
router.get("/", protect, adminOnly, async (req, res) => {
    try {
        const reports = await Report.find().populate("submittedBy", "name email").sort({ createdAt: -1 });
        return res.json({ success: true, data: reports.map(present) });
    } catch (error) {
        console.error("Admin reports error:", error);
        return res.status(500).json({ success: false, message: "Unable to load reports." });
    }
});

// Public contributor submission: collect contact details, but do not require an account.
router.post("/", async (req, res) => {
    try {
        const latitude = Number(req.body.latitude);
        const longitude = Number(req.body.longitude);
        const severityInput = String(req.body.severity || "medium").toLowerCase();
        const severity = ({ severe: "high", "high red severity": "high", "normal damage": "low", normal: "low" })[severityInput] || severityInput;
        const contributorName = typeof req.body.contributor_name === "string" ? req.body.contributor_name.trim().slice(0, 100) : "";
        const contributorPhone = typeof req.body.contributor_phone === "string" ? req.body.contributor_phone.trim().slice(0, 20) : "";
        const contributorEmail = typeof req.body.contributor_email === "string" ? req.body.contributor_email.trim().toLowerCase().slice(0, 254) : "";
        const contributorLocation = typeof req.body.contributor_location === "string" ? req.body.contributor_location.trim().slice(0, 200) : "";
        const locationName = typeof req.body.location_name === "string" ? req.body.location_name.trim().slice(0, 200) : "";
        const damageType = String(req.body.damage_type || req.body.damageType || "Road damage").trim().slice(0, 100);
        const description = String(req.body.description || damageType).trim().slice(0, 1000);
        const image = typeof req.body.image_base64 === "string" ? req.body.image_base64 : req.body.imageUrl;

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return res.status(400).json({ success: false, message: "Valid GPS coordinates are required." });
        }
        if (!contributorName || !contributorPhone) {
            return res.status(400).json({ success: false, message: "Contributor name and phone number are required." });
        }
        if (contributorEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contributorEmail)) {
            return res.status(400).json({ success: false, message: "Enter a valid contributor email address." });
        }
        if (!SEVERITIES.includes(severity)) {
            return res.status(400).json({ success: false, message: "Severity must be low, medium or high." });
        }
        if (typeof image !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 5 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "A valid image (maximum 3.7 MB) is required." });
        }

        // Upload the submitted image to Cloudinary; MongoDB stores only its HTTPS URL.
        const cloudinary = configureCloudinary();
        const uploadedImage = await cloudinary.uploader.upload(image, {
            folder: "roadguard-ai/reports",
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [{ quality: "auto:good", fetch_format: "auto" }]
        });

        const report = await Report.create({
            submittedBy: null,
            contributorName,
            contributorPhone,
            contributorEmail,
            contributorLocation,
            location: { type: "Point", coordinates: [longitude, latitude] },
            locationName,
            damageType,
            severity,
            description,
            imageUrl: uploadedImage.secure_url,
            status: "pending"
        });
        return res.status(201).json({ success: true, message: "Report submitted for admin review.", data: present(report) });
    } catch (error) {
        console.error("Create report error:", error);
        const cloudinaryNotConfigured = /Cloudinary is not configured/.test(error.message || "");
        return res.status(cloudinaryNotConfigured ? 503 : 400).json({
            success: false,
            message: cloudinaryNotConfigured ? error.message : "Unable to submit report. Please try again."
        });
    }
});

// Admin-only status changes.
router.patch("/:id/status", protect, adminOnly, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid report ID." });
        }
        const status = String(req.body.status || "");
        if (!STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid report status." });
        }
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        ).populate("submittedBy", "name email");
        if (!report) return res.status(404).json({ success: false, message: "Report not found." });
        return res.json({ success: true, message: "Report status updated.", data: present(report) });
    } catch (error) {
        console.error("Update report error:", error);
        return res.status(500).json({ success: false, message: "Unable to update report status." });
    }
});

module.exports = router;
