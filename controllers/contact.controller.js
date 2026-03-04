import prisma from "../database/neon.js";
import { customAlphabet } from 'nanoid';

// Generate CUID-like IDs (compatible with Prisma's cuid())
const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 25);

export const createContact = async (req, res, next) => {
    try {
        const { name, email, subject, message } = req.body;

        const newContact = await prisma.contact.create({
            data: {
                id: `c${nanoid()}`, // Generate CUID-like ID
                name,
                email,
                subject,
                message
            }
        });

        res.status(201).json({
            success: true,
            message: "Contact form submitted successfully!",
            data: newContact
        });
    } catch (error) {
        next(error);
    }
};

export const getContacts = async (req, res, next) => {
    try {
        const contacts = await prisma.contact.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.status(200).json({
            success: true,
            data: contacts
        });
    } catch (error) {
        next(error);
    }
};
