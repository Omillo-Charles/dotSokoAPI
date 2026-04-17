import prisma from "../database/postgresql.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JWT_EXPIRY, JWT_SECRET, NODE_ENV, JWT_REFRESH_SECRET, JWT_REFRESH_EXPIRY, FRONTEND_URL } from "../config/env.js";
import { sendEmail } from "../config/nodemailer.js";
import { getWelcomeEmailTemplate, getForgotPasswordEmailTemplate, getVerificationEmailTemplate } from "../utils/emailTemplates.js";
import logger from "../utils/logger.js";
import { AppError, NotFoundError, UnauthorizedError, ValidationError, UnauthenticatedError } from "../utils/errors.js";

const generateTokens = (userId) => {
    const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY });
    return { accessToken, refreshToken };
};

export const signUp = async (req, res, next) => {
    try {
        const {name, email, password} = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new ValidationError("User already exists");
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 15 * 60 * 1000);

        const created = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                verificationOTP: otp,
                verificationOTPExpires: otpExpires
            }
        });

        const tokens = generateTokens(created.id);
        await prisma.user.update({
            where: { id: created.id },
            data: { refreshToken: tokens.refreshToken }
        });

        // Send Verification Email
        try {
            const template = getVerificationEmailTemplate(name, otp);
            await sendEmail({
                to: email,
                subject: template.subject,
                text: template.text,
                html: template.html
            });
        } catch (emailError) {
            
        }

        const { password: _p, refreshToken: _r, verificationOTP: _o, verificationOTPExpires: _e, ...safeUser } = created;

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            success: true,
            message: "User signed up successfully!",
            data: {
                user: safeUser,
                accessToken: tokens.accessToken
            }
        });

    } catch (error) {
        next(error);
    }
}

export const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const userId = req.user?.id || req.user?._id?.toString();
        const user = await prisma.user.findUnique({ where: { id: userId } });
        
        const isMatch = user && user.password ? await bcrypt.compare(currentPassword, user.password) : false;
        if (!isMatch) {
            const error = new Error('Current password is incorrect');
            error.statusCode = 401;
            throw error;
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedPassword }
        });

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
};

export const signIn = async (req, res, next) => {
    try {
        const {email, password} = req.body;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (!existingUser) {
            throw new NotFoundError("User does not exist");
        }

        const isMatch = existingUser.password ? await bcrypt.compare(password, existingUser.password) : false;
        if (!isMatch) {
            const error = new Error("Incorrect password");
            error.statusCode = 400;
            throw error;
        }

        if (!existingUser.isVerified) {
            const error = new Error("Please verify your email before signing in");
            error.statusCode = 401;
            throw error;
        }

        const tokens = generateTokens(existingUser.id);
        await prisma.user.update({
            where: { id: existingUser.id },
            data: { refreshToken: tokens.refreshToken }
        });

        const { password: _p, refreshToken: _r, ...safeUser } = existingUser;

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(200).json({
            success: true,
            message: "User signed in successfully!",
            data: {
                user: safeUser,
                accessToken: tokens.accessToken
            }
        });
        
    } catch (error) {
        next(error);
    }
}

export const signOut = async (req, res, next) => {
   try {
    res.clearCookie("refreshToken", {
        httpOnly: true,
        sameSite: 'strict',
        secure: NODE_ENV === "production"
    })

    res.status(200).json({
        success: true,
        message: "User signed out successfully!"
    });
    
   } catch (error) {
    next(error);
   }
}

export const refresh = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            const error = new Error('Refresh token not found');
            error.statusCode = 401;
            throw error;
        }

        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

        if (!user || user.refreshToken !== refreshToken) {
            const error = new Error('Invalid refresh token');
            error.statusCode = 401;
            throw error;
        }

        const tokens = generateTokens(user.id);
        await prisma.user.update({
            where: { id: user.id },
            data: { refreshToken: tokens.refreshToken }
        });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(200).json({
            success: true,
            accessToken: tokens.accessToken
        });
    } catch (error) {
        next(error);
    }
};

export const googleAuthSuccess = async (req, res, next) => {
    try {
        const email = req.user.email;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: req.user.name,
                    email: req.user.email,
                    googleId: req.user.googleId || req.user.id,
                    isVerified: true
                }
            });
        } else {
            await prisma.user.update({
                where: { id: user.id },
                data: { googleId: req.user.googleId || req.user.id, isVerified: true }
            });
            user = await prisma.user.findUnique({ where: { id: user.id } });
        }
        const tokens = generateTokens(user.id);
        await prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken } });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        const userData = JSON.stringify({
            _id: user.id,
            name: user.name,
            email: user.email,
            isVerified: user.isVerified
        });

        // Default to /account for a smoother dashboard transition
        const redirectTo = req.query.redirect_to || `${FRONTEND_URL}/account`;
        const separator = redirectTo.includes('?') ? '&' : '?';
        
        res.redirect(`${redirectTo}${separator}mode=social-success&token=${tokens.accessToken}&user=${encodeURIComponent(userData)}`);
    } catch (error) {
        next(error);
    }
};

export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            const error = new Error("User with this email does not exist");
            error.statusCode = 404;
            throw error;
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: new Date(Date.now() + 3600000)
            }
        });

        const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;
        const template = getForgotPasswordEmailTemplate(user.name, resetUrl);

        try {
            await sendEmail({
                to: email,
                subject: template.subject,
                text: template.text,
                html: template.html
            });

            res.status(200).json({
                success: true,
                message: "Password reset link sent to your email"
            });
        } catch (emailError) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    resetPasswordToken: null,
                    resetPasswordExpires: null
                }
            });
            
            const error = new Error("Email could not be sent");
            error.statusCode = 500;
            throw error;
        }
    } catch (error) {
        next(error);
    }
};

export const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: hashedToken,
                resetPasswordExpires: { gt: new Date() }
            }
        });

        if (!user) {
            const error = new Error("Invalid or expired reset token");
            error.statusCode = 400;
            throw error;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        res.status(200).json({
            success: true,
            message: "Password updated successfully"
        });
    } catch (error) {
        next(error);
    }
};

export const verifyEmail = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        const user = await prisma.user.findFirst({
            where: {
                email,
                verificationOTP: otp,
                verificationOTPExpires: { gt: new Date() }
            }
        });

        if (!user) {
            const error = new Error("Invalid or expired verification code");
            error.statusCode = 400;
            throw error;
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isVerified: true,
                verificationOTP: null,
                verificationOTPExpires: null
            }
        });

        // Send Welcome Email after successful verification
        try {
            const template = getWelcomeEmailTemplate(user.name);
            await sendEmail({
                to: user.email,
                subject: template.subject,
                text: template.text,
                html: template.html
            });
        } catch (emailError) {
            
        }

        res.status(200).json({
            success: true,
            message: "Email verified successfully! You can now sign in."
        });
    } catch (error) {
        next(error);
    }
};

export const githubAuthSuccess = async (req, res, next) => {
    try {
        const email = req.user.email || `${req.user.username}@github.com`;
        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    name: req.user.name || req.user.username,
                    email,
                    githubId: req.user.githubId || req.user.id,
                    isVerified: true
                }
            });
        } else {
            await prisma.user.update({
                where: { id: user.id },
                data: { githubId: req.user.githubId || req.user.id, isVerified: true }
            });
            user = await prisma.user.findUnique({ where: { id: user.id } });
        }
        const tokens = generateTokens(user.id);
        await prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken } });

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        const userData = JSON.stringify({
            _id: user.id,
            name: user.name,
            email: user.email,
            isVerified: user.isVerified
        });

        // Default to /account for a smoother dashboard transition
        const redirectTo = req.query.redirect_to || `${FRONTEND_URL}/account`;
        const separator = redirectTo.includes('?') ? '&' : '?';

        res.redirect(`${redirectTo}${separator}mode=social-success&token=${tokens.accessToken}&user=${encodeURIComponent(userData)}`);
    } catch (error) {
        next(error);
    }
};
