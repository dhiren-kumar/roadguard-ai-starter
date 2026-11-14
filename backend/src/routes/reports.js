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
        evidence_photos: (r.evidencePhotos && r.evidencePhotos.length ? r.evidencePhotos : [{ imageUrl: r.imageUrl, detections: [] }]).map(p => ({ image_url: p.imageUrl, detections: p.detections || [] })),
        damage_count: Number.isFinite(r.damageCount) ? r.damageCount : (r.evidencePhotos || []).reduce((n, p) => n + (p.detections || []).length, 0),
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


// Public detail endpoint: expose full evidence only for reports already visible publicly.
router.get("/public/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid report ID." });
        }
        const report = await Report.findOne({
            _id: req.params.id,
            status: { $in: ["approved", "under-construction", "resolved"] }
        }).lean();
        if (!report) return res.status(404).json({ success: false, message: "Public report not found." });
        const photos = Array.isArray(report.evidencePhotos) && report.evidencePhotos.length
            ? report.evidencePhotos
            : [{ imageUrl: report.imageUrl, detections: [] }];
        const damageCount = Number.isFinite(report.damageCount)
            ? report.damageCount
            : photos.reduce((sum, photo) => sum + ((photo.detections || []).length), 0);
        res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=45");
        return res.json({
            success: true,
            data: {
                id: report._id,
                damage_type: report.damageType,
                severity: report.severity,
                description: report.description,
                status: report.status,
                latitude: report.location.coordinates[1],
                longitude: report.location.coordinates[0],
                location_name: report.locationName || "",
                timestamp: report.createdAt,
                evidence_photos: photos.map(photo => ({
                    image_url: photo.imageUrl,
                    detections: (photo.detections || []).map(d => ({
                        label: d.label,
                        confidence: d.confidence,
                        boundingBox: d.boundingBox || null
                    }))
                })),
                damage_count: damageCount
            }
        });
    } catch (error) {
        console.error("Public report detail error:", error);
        return res.status(500).json({ success: false, message: "Unable to load report details." });
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
        const legacyImage = typeof req.body.image_base64 === "string" ? req.body.image_base64 : req.body.imageUrl;
        const photos = Array.isArray(req.body.evidence_photos) ? req.body.evidence_photos : (legacyImage ? [{ image_base64: legacyImage, detections: [] }] : []);

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
        if (!photos.length || photos.length > 5) {
            return res.status(400).json({ success: false, message: "Add between 1 and 5 evidence photos." });
        }
        const imagePattern = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
        for (const photo of photos) {
            if (!photo || typeof photo.image_base64 !== "string" || !imagePattern.test(photo.image_base64) || photo.image_base64.length > 5 * 1024 * 1024) {
                return res.status(400).json({ success: false, message: "Each evidence photo must be a valid image no larger than 3.7 MB." });
            }
            if (photo.detections !== undefined && (!Array.isArray(photo.detections) || photo.detections.length > 100)) {
                return res.status(400).json({ success: false, message: "Each photo can contain at most 100 AI detections." });
            }
        }

        const cloudinary = configureCloudinary();
        const evidencePhotos = [];
        for (const photo of photos) {
            const uploaded = await cloudinary.uploader.upload(photo.image_base64, {
                folder: "roadguard-ai/reports",
                resource_type: "image",
                allowed_formats: ["jpg", "jpeg", "png", "webp"],
                transformation: [{ quality: "auto:good", fetch_format: "auto" }]
            });
            const detections = (photo.detections || []).map(d => ({
                label: String(d.label || "Road damage").trim().slice(0, 80),
                confidence: Number.isFinite(Number(d.confidence)) ? Math.max(0, Math.min(1, Number(d.confidence))) : undefined,
                ...(d.boundingBox && typeof d.boundingBox === "object" ? {
                    boundingBox: {
                        x: Math.max(0, Math.min(1, Number(d.boundingBox.x))),
                        y: Math.max(0, Math.min(1, Number(d.boundingBox.y))),
                        width: Math.max(0, Math.min(1, Number(d.boundingBox.width))),
                        height: Math.max(0, Math.min(1, Number(d.boundingBox.height)))
                    }
                } : {})
            }));
            evidencePhotos.push({ imageUrl: uploaded.secure_url, detections });
        }
        const damageCount = evidencePhotos.reduce((n, p) => n + p.detections.length, 0);

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
            imageUrl: evidencePhotos[0].imageUrl,
            evidencePhotos,
            damageCount,
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
