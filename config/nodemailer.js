import nodemailer from 'nodemailer';
import { EMAIL_USER, EMAIL_PASSWORD } from './env.js';
import logger from '../utils/logger.js';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
    },
});

/**
 * Standardized email sending helper
 * @param {Object} options - Email options (to, subject, text, html)
 */
export const sendEmail = async ({ to, subject, text, html }) => {
    try {
        const mailOptions = {
            from: `".soko Support" <${EMAIL_USER}>`,
            to,
            subject,
            text,
            html,
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email sent successfully to ${to}`, { messageId: info.messageId });
        return info;
    } catch (error) {
        logger.error(`Failed to send email to ${to}: ${error.message}`, {
            stack: error.stack,
            subject,
            to
        });
        throw error;
    }
};

export default transporter;
