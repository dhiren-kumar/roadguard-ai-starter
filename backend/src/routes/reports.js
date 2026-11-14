const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const { protect, adminOnly } = require("../middleware/auth"); // Adjust path to your auth middleware if necessary

// @route   GET /api/reports
// @desc    Get all road hazard reports
// @access  Public (or protected depending on your app design)
router.get("/", async (req, res) => {
    try {
        const reports = await Report.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({
            success: false,
            message: "Server error fetching reports"
        });
    }
});

// @route   POST /api/reports
// @desc    Create a new report
// @access  Public / Authenticated
router.post("/", async (req, res) => {
    try {
        const newReport = new Report(req.body);
        const savedReport = await newReport.save();
        res.status(201).json({
            success: true,
            data: savedReport
        });
    } catch (error) {
        console.error("Error creating report:", error);
        res.status(400).json({
            success: false,
            message: "Failed to create report",
            error: error.message
        });
    }
});

// @route   PATCH /api/reports/:id/status
// @desc    Update report status (Admin only)
// @access  Private/Admin
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

            res.status(200).json({
                success: true,
                data: report
            });
        } catch (error) {
            console.error("Error updating report status:", error);
            res.status(500).json({
                success: false,
                message: "Server error updating status",
                error: error.message
            });
        }
    }
);

module.exports = router;
