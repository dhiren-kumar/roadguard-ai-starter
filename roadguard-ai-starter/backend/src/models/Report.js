
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

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

        imageUrl: {
            type: String,
            required: true
        },

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

// Geospatial index for nearby-road report checking
reportSchema.index({ location: "2dsphere" });

const Report = mongoose.model("Report", reportSchema);

module.exports = Report;
