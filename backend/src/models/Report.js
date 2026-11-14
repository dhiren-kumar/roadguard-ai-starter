
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false,
            default: null
        },
        contributorName: { type: String, required: true, trim: true, maxlength: 100 },
        contributorPhone: { type: String, required: true, trim: true, maxlength: 20 },
        contributorEmail: { type: String, trim: true, maxlength: 254 },
        contributorLocation: { type: String, trim: true, maxlength: 200 },

        locationName: { type: String, trim: true, maxlength: 200 },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
                required: true
            },

            coordinates: {
                type: [Number],
                required: true
            }
        },

        damageType: {
            type: String,
            required: true,
            trim: true
        },

        severity: {
            type: String,
            enum: ["low", "medium", "high"],
            required: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        imageUrl: { type: String, required: true },
        // Optional for legacy compatibility: one report can hold several photo-specific AI results.
        evidencePhotos: [{
            imageUrl: { type: String, required: true },
            detections: [{
                label: { type: String, required: true, trim: true, maxlength: 80 },
                confidence: { type: Number, min: 0, max: 1 },
                boundingBox: {
                    x: { type: Number, min: 0, max: 1 },
                    y: { type: Number, min: 0, max: 1 },
                    width: { type: Number, min: 0, max: 1 },
                    height: { type: Number, min: 0, max: 1 }
                }
            }]
        }],
        damageCount: { type: Number, min: 0, default: 0 },

        status: {
            type: String,
            enum: [
                "pending",
                "approved",
                "under-construction",
                "resolved",
                "rejected"
            ],
            default: "pending"
        }
    },
    {
        timestamps: true
    }
);

// Indexes support nearby-road checks and the public status/date query.
reportSchema.index({ location: "2dsphere" });
reportSchema.index({ status: 1, createdAt: -1 });

const Report = mongoose.model("Report", reportSchema);

module.exports = Report;
