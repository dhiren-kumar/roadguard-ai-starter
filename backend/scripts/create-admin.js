require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User");

async function main() {
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "");
    const name = String(process.env.ADMIN_NAME || "RoadGuard Administrator").trim();
    if (!email || !password || password.length < 12) {
        throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) in the environment before running this script.");
    }
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
    await mongoose.connect(process.env.MONGODB_URI);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.findOneAndUpdate(
        { email },
        { $set: { name, email, passwordHash, role: "admin", isEmailVerified: true, emailVerificationTokenHash: null, emailVerificationExpires: null } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    console.log(`Admin account ready: ${user.email}`);
    console.log("Remove ADMIN_PASSWORD from the deployment environment after provisioning.");
}

main()
    .catch(error => { console.error("Admin provisioning failed:", error.message); process.exitCode = 1; })
    .finally(async () => { await mongoose.disconnect(); });
