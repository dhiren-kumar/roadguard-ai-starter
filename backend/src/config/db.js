
const dns = require("dns");

// Use Google DNS for MongoDB Atlas SRV lookup
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI;

        if (!mongoURI) {
            throw new Error("MONGODB_URI is missing from .env file");
        }

        console.log("Connecting to MongoDB Atlas...");

        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 15000
        });

        console.log("--------------------------------");
        console.log("MongoDB Connected Successfully!");
        console.log("Database Host:", conn.connection.host);
        console.log("Database Name:", conn.connection.name);
        console.log("--------------------------------");

        return conn;

    } catch (error) {
        console.error("--------------------------------");
        console.error("MongoDB Connection Failed!");
        console.error("Error:", error.message);
        console.error("--------------------------------");

        throw error;
    }
};

module.exports = connectDB;
