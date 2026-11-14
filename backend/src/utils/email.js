const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error("EMAIL_USER and EMAIL_PASS must be configured.");
    }
    transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    return transporter;
}

async function sendEmail(to, subject, html) {
    if (!to || !subject || !html) throw new Error("Email recipient, subject and body are required.");
    const mailer = getTransporter();
    return mailer.sendMail({
        from: process.env.EMAIL_FROM || `"RoadGuard AI" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html
    });
}

module.exports = sendEmail;
