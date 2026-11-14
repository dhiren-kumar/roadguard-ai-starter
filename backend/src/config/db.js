const mongoose = require("mongoose");

async function connectDB() {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI || !/^mongodb(\+srv)?:\/\//i.test(mongoURI)) {
        throw new Error("MONGODB_URI is missing or is not a valid MongoDB connection string.");
    }
    const connection = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 15000 });
    console.log(`MongoDB connected: ${connection.connection.host}/${connection.connection.name}`);
    return connection;
}

module.exports = connectDB;
