const express = require("express");
const mongoose = require("mongoose");
const Report = require("../models/Report");
const { protect, adminOnly, contributorOnly } = require("../middleware/auth");

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
        location_name: `${r.location.coordinates[1]}, ${r.location.coordinates[0]}`,
        image_base64: r.imageUrl,
        contributor_name: r.submittedBy && r.submittedBy.name ? r.submittedBy.name : "Contributor",
        timestamp: r.createdAt
    };
}

// Public map: only reports approved for public viewing.
router.get("/public", async (req, res) => {
    try {
        const reports = await Report.find({ status: { $in: ["approved", "under-construction", "resolved"] } })
            .sort({ createdAt: -1 })
            .select("-submittedBy");
        return res.json(reports.map(present));
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

// Contributor-only report submission.
router.post("/", protect, contributorOnly, async (req, res) => {
    try {
        const latitude = Number(req.body.latitude);
        const longitude = Number(req.body.longitude);
        const severityInput = String(req.body.severity || "medium").toLowerCase();
        const severity = ({ severe: "high", "high red severity": "high", "normal damage": "low", normal: "low" })[severityInput] || severityInput;
        const damageType = String(req.body.damage_type || req.body.damageType || "Road damage").trim().slice(0, 100);
        const description = String(req.body.description || damageType).trim().slice(0, 1000);
        const image = typeof req.body.image_base64 === "string" ? req.body.image_base64 : req.body.imageUrl;

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return res.status(400).json({ success: false, message: "Valid GPS coordinates are required." });
        }
        if (!SEVERITIES.includes(severity)) {
            return res.status(400).json({ success: false, message: "Severity must be low, medium or high." });
        }
        if (typeof image !== "string" || !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 5 * 1024 * 1024) {
            return res.status(400).json({ success: false, message: "A valid image (maximum 3.7 MB) is required." });
        }

        const report = await Report.create({
            submittedBy: req.user._id,
            location: { type: "Point", coordinates: [longitude, latitude] },
            damageType,
            severity,
            description,
            imageUrl: image,
            status: "pending"
        });
        return res.status(201).json({ success: true, message: "Report submitted for admin review.", data: present(report) });
    } catch (error) {
        console.error("Create report error:", error);
        return res.status(400).json({ success: false, message: "Unable to submit report." });
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
