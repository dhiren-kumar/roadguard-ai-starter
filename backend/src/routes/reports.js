
const express = require("express");
const fs = require("fs");

const Report = require("../models/Report");
const { protect, adminOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// ============================================
// 1. PUBLIC ROAD REPORTS
// GET /api/reports/public
// ============================================

router.get("/public", async (req, res) => {
    try {
        const reports = await Report.find({
            status: {
                $in: ["approved", "under-construction", "resolved"]
            }
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reports.length,
            reports
        });

    } catch (error) {
        console.error("Public reports error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch public reports."
        });
    }
});


// ============================================
// 2. SUBMIT NEW ROAD DAMAGE REPORT
// POST /api/reports
// ============================================

router.post(
    "/",
    protect,
    upload.single("image"),
    async (req, res) => {
        try {
            const {
                latitude,
                longitude,
                damageType,
                severity,
                description
            } = req.body;

            // Check image
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Please upload a road damage image."
                });
            }

            // Validate GPS
            const lat = Number(latitude);
            const lng = Number(longitude);

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lng) ||
                lat < -90 ||
                lat > 90 ||
                lng < -180 ||
                lng > 180
            ) {
                fs.unlink(req.file.path, () => {});

                return res.status(400).json({
                    success: false,
                    message: "Invalid GPS coordinates."
                });
            }

            // Check duplicate reports within 25 metres
            const existingReport = await Report.findOne({
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [lng, lat]
                        },
                        $maxDistance: 25
                    }
                },
                status: { $ne: "rejected" }
            });

            if (existingReport) {
                fs.unlink(req.file.path, () => {});

                return res.status(409).json({
                    success: false,
                    message: "A road damage report already exists near this location.",
                    existingReportId: existingReport._id
                });
            }

            // Save new report
            const report = await Report.create({
                submittedBy: req.user._id,

                location: {
                    type: "Point",
                    coordinates: [lng, lat]
                },

                damageType: damageType || "unknown",
                severity: severity || "medium",
                description: description || "",

                imageUrl: `/uploads/${req.file.filename}`,

                status: "pending"
            });

            return res.status(201).json({
                success: true,
                message: "Road damage report submitted successfully. Waiting for admin approval.",
                report
            });

        } catch (error) {
            console.error("Submit report error:", error);

            if (req.file) {
                fs.unlink(req.file.path, () => {});
            }

            return res.status(500).json({
                success: false,
                message: "Unable to submit road damage report."
            });
        }
    }
);


// ============================================
// 3. CONTRIBUTOR'S OWN REPORTS
// GET /api/reports/mine
// ============================================

router.get("/mine", protect, async (req, res) => {
    try {
        const reports = await Report.find({
            submittedBy: req.user._id
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reports.length,
            reports
        });

    } catch (error) {
        console.error("My reports error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch your reports."
        });
    }
});


// ============================================
// 4. ADMIN GET ALL REPORTS
// GET /api/reports
// ============================================

router.get("/", protect, adminOnly, async (req, res) => {
    try {
        const reports = await Report.find()
            .populate("submittedBy", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: reports.length,
            reports
        });

    } catch (error) {
        console.error("Admin reports error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch all reports."
        });
    }
});


// ============================================
// 5. GET SINGLE REPORT
// GET /api/reports/:id
// ============================================

router.get("/:id", protect, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate("submittedBy", "name email");

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Report not found."
            });
        }

        // Contributors can only access their own reports
        if (
            req.user.role !== "admin" &&
            String(report.submittedBy._id) !== String(req.user._id)
        ) {
            return res.status(403).json({
                success: false,
                message: "You cannot access this report."
            });
        }

        return res.status(200).json({
            success: true,
            report
        });

    } catch (error) {
        console.error("Single report error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to fetch report."
        });
    }
});


// ============================================
// 6. ADMIN UPDATE REPORT STATUS
// PATCH /api/reports/:id/status
// ============================================

router.patch(
    "/:id/status",
    protect,
    adminOnly,
    async (req, res) => {
        try {
            const allowedStatuses = [
                "pending",
                "approved",
                "under-construction",
                "resolved",
                "rejected"
            ];

            const { status } = req.body;

            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid report status."
                });
            }

            const report = await Report.findByIdAndUpdate(
                req.params.id,
                { status },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!report) {
                return res.status(404).json({
                    success: false,
                    message: "Report not found."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Report status updated successfully.",
                report
            });

        } catch (error) {
            console.error("Update status error:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to update report status."
            });
        }
    }
);


// ============================================
// 7. ADMIN UPDATE REPORT DETAILS
// PATCH /api/reports/:id
// ============================================

router.patch("/:id", protect, adminOnly, async (req, res) => {
    try {
        const allowedFields = [
            "damageType",
            "severity",
            "description"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const report = await Report.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        );

        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Report not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Report details updated successfully.",
            report
        });

    } catch (error) {
        console.error("Edit report error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to update report."
        });
    }
});


// ============================================
// EXPORT ROUTER
// ============================================

module.exports = router;

