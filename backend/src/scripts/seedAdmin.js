
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

async function createAdmin() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const email = process.env.ADMIN_EMAIL.toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (!email || !password || password.length < 12) {
            throw new Error("Configure a strong admin password in .env");
        }

        await User.findOneAndUpdate(
            { email },
            {
                name: process.env.ADMIN_NAME,
                email,
                passwordHash: await bcrypt.hash(password, 12),
                role: "admin",
                isEmailVerified: true
            },
            { upsert: true, new: true }
        );

        console.log("Admin account created successfully");

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();
