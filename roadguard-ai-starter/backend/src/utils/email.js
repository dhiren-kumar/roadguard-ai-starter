
const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html) => {
    try {
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            throw new Error("EMAIL_USER or EMAIL_PASS is missing in .env");
        }

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        // Verify SMTP connection
        await transporter.verify();

        const info = await transporter.sendMail({
            from: `"RoadGuard AI" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });

        console.log("Verification email sent:", info.messageId);

        return info;

    } catch (error) {
        console.error("EMAIL SENDING ERROR:");
        console.error(error.message);
        throw error;
    }
};

module.exports = sendEmail;
