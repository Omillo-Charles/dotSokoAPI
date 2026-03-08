import prisma from '../database/postgresql.js';
import { uploadToImageKit } from '../config/imagekit.js';
import { invalidateCache } from '../middlewares/cache.middleware.js';
import { extractUserIdFromToken } from '../middlewares/auth.middleware.js';
import crypto from 'crypto';

export const createStory = async (req, res, next) => {
    try {
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });

        if (!shop) {
            const error = new Error('Only users with a registered shop can post updates.');
            error.statusCode = 403;
            throw error;
        }

        const { caption, duration } = req.body;
        
        let mediaUrl = null;
        let mediaType = "image";

        if (req.file) {
            console.log("Uploading story media to ImageKit...");
            try {
                if (req.file.mimetype.startsWith('video/')) {
                    mediaType = "video";
                }
                const result = await uploadToImageKit(req.file, "duuka/stories");
                mediaUrl = result.url;
            } catch (uploadError) {
                console.error("ImageKit upload failed for story:", uploadError);
                throw uploadError;
            }
        }

        if (!mediaUrl) {
            const error = new Error('Media file is required for a story update.');
            error.statusCode = 400;
            throw error;
        }

        // Set expiration to 24 hours from now
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        const story = await prisma.updates.create({
            data: {
                id: crypto.randomUUID(),
                shop_id: shop.id,
                media_url: mediaUrl,
                type: mediaType,
                caption: caption || null,
                expires_at: expiresAt,
                updated_at: new Date()
            }
        });

        // Clear any cached story feeds
        await invalidateCache('cache:/api/v1/stories*');

        res.status(201).json({
            success: true,
            message: "Story update posted successfully",
            data: story
        });
    } catch (error) {
        next(error);
    }
};

export const getActiveStories = async (req, res, next) => {
    try {
        const userId = extractUserIdFromToken(req);

        const activeStories = await prisma.updates.findMany({
            where: {
                expires_at: {
                    gt: new Date() // Only stories that haven't expired
                }
            },
            include: {
                shops: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        avatar: true
                    }
                },
                update_views: userId ? {
                    where: { user_id: userId }
                } : false
            },
            orderBy: {
                created_at: 'asc' // Oldest first inside a shop's array
            }
        });

        // Group stories by shop so the frontend can easily consume them
        const groupedStories = activeStories.reduce((acc, story) => {
            const shopId = story.shop_id;
            if (!acc[shopId]) {
                acc[shopId] = {
                    id: story.shops.id,
                    username: story.shops.username || story.shops.name,
                    avatar: story.shops.avatar,
                    items: [],
                    allViewed: true // Default to true, will be set to false if any unviewed item found
                };
            }
            
            const isViewed = userId ? story.update_views.length > 0 : false;
            if (!isViewed) {
                acc[shopId].allViewed = false;
            }

            acc[shopId].items.push({
                id: story.id,
                type: story.type,
                url: story.media_url,
                text: story.caption,
                duration: 5000,
                createdAt: story.created_at,
                viewed: isViewed
            });
            return acc;
        }, {});

        // Convert the map to an array and sort by most recently active shop
        const responseData = Object.values(groupedStories).sort((a, b) => {
            // Sort unviewed shops first, then by date
            if (a.allViewed !== b.allViewed) {
                return a.allViewed ? 1 : -1;
            }
            const aLastUpdate = a.items[a.items.length - 1].createdAt;
            const bLastUpdate = b.items[b.items.length - 1].createdAt;
            return new Date(bLastUpdate) - new Date(aLastUpdate);
        });

        res.status(200).json({
            success: true,
            data: responseData
        });
    } catch (error) {
        next(error);
    }
};

export const getMyStories = async (req, res, next) => {
    try {
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });

        if (!shop) {
             return res.status(200).json({ success: true, data: [] });
        }

        const stories = await prisma.updates.findMany({
            where: { shop_id: shop.id },
            orderBy: { created_at: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: stories
        });
    } catch (error) {
        next(error);
    }
};

export const deleteStory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const ownerId = req.user?.id || req.user?._id?.toString();
        
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            const error = new Error('Not authorized');
            error.statusCode = 403;
            throw error;
        }

        const story = await prisma.updates.findUnique({ where: { id } });
        if (!story) {
            const error = new Error('Story not found');
            error.statusCode = 404;
            throw error;
        }

        if (story.shop_id !== shop.id) {
            const error = new Error('You cannot delete another shop\'s story');
            error.statusCode = 403;
            throw error;
        }

        await prisma.updates.delete({ where: { id } });
        
        // Clear caches
        await invalidateCache('cache:/api/v1/stories*');

        res.status(200).json({
            success: true,
            message: "Story deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

export const markUpdateAsViewed = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?._id?.toString();

        if (!userId) {
            return res.status(200).json({ success: true, message: "Guest view not persisted" });
        }

        const update = await prisma.updates.findUnique({ where: { id } });
        if (!update) {
            const error = new Error('Update not found');
            error.statusCode = 404;
            throw error;
        }

        // Use upsert to avoid duplicate key errors if already viewed
        await prisma.update_views.upsert({
            where: {
                update_id_user_id: {
                    update_id: id,
                    user_id: userId
                }
            },
            update: {
                viewed_at: new Date()
            },
            create: {
                id: crypto.randomUUID(),
                update_id: id,
                user_id: userId
            }
        });

        // Increment views count on the update
        await prisma.updates.update({
            where: { id },
            data: {
                views_count: {
                    increment: 1
                }
            }
        });

        res.status(200).json({
            success: true,
            message: "View recorded"
        });
    } catch (error) {
        next(error);
    }
};
