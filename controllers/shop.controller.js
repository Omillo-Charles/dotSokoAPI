import prisma from "../database/postgresql.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { uploadToImageKit } from "../config/imagekit.js";
import { invalidateCache } from "../middlewares/cache.middleware.js";

export const createShop = async (req, res, next) => {
    try {
        const { name, username, description, category, address, phone, email } = req.body;
        
        const ownerId = req.user?.id || req.user?._id?.toString();
        const existingShop = await prisma.shop.findUnique({ where: { ownerId } });
        if (existingShop) {
            const error = new Error('User already has a shop');
            error.statusCode = 400;
            throw error;
        }

        if (username) {
            const existingUsername = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
            if (existingUsername) {
                const error = new Error('Username is already taken');
                error.statusCode = 400;
                throw error;
            }
        }

        const data = {
            ownerId,
            name,
            username: username?.toLowerCase() || null,
            description,
            category,
            address,
            phone,
            email
        };

        if (req.files) {
            if (req.files.avatar) {
                console.log("Uploading avatar to ImageKit (Shop Creation)...");
                const result = await uploadToImageKit(req.files.avatar[0], "duuka/avatars");
                data.avatar = result.url;
            }
            if (req.files.banner) {
                console.log("Uploading banner to ImageKit (Shop Creation)...");
                const result = await uploadToImageKit(req.files.banner[0], "duuka/banners");
                data.banner = result.url;
            }
        }

        const shop = await prisma.shop.create({
            data
        });

        // Invalidate shop caches
        await invalidateCache("cache:/api/v1/shops*");

        res.status(201).json({
            success: true,
            message: "Shop created successfully",
            data: shop
        });
    } catch (error) {
        next(error);
    }
};

export const getMyShop = async (req, res, next) => {
    try {
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            return res.status(200).json({
                success: true,
                data: null
            });
        }

        const productsCount = await prisma.product.count({ where: { shopId: shop.id } });
        const followersCount = await prisma.shop.findUnique({
            where: { id: shop.id },
            include: { _count: { select: { followers: true } } }
        }).then(s => s?._count?.followers || 0);
        const followingCount = await prisma.shop.count({ where: { followers: { some: { id: ownerId } } } });

        res.status(200).json({
            success: true,
            data: {
                ...shop,
                productsCount,
                followersCount,
                followingCount,
                rating: shop.rating || 0,
                reviewsCount: shop.reviewsCount || 0
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getShops = async (req, res, next) => {
    try {
        const { limit } = req.query;
        const limitValue = parseInt(limit) || 20;
        const shops = await prisma.shop.findMany({ take: limitValue });
        let userId = null;
        try {
            const auth = req.headers?.authorization;
            if (auth?.startsWith('Bearer ')) {
                const token = auth.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                userId = decoded?.userId || null;
            }
        } catch (e) {
            userId = null;
        }
        
        const shopsWithCounts = await Promise.all(shops.map(async (shop) => {
            const productsCount = await prisma.product.count({ where: { shopId: shop.id } });
            const followersCount = await prisma.shop.findUnique({
                where: { id: shop.id },
                include: { _count: { select: { followers: true } } }
            }).then(s => s?._count?.followers || 0);
            const followingCount = await prisma.shop.count({ where: { followers: { some: { id: shop.ownerId } } } });
            let isFollowing = false;
            if (userId) {
                const rel = await prisma.shop.findFirst({ where: { id: shop.id, followers: { some: { id: userId } } }, select: { id: true } });
                isFollowing = Boolean(rel);
            }
            
            return {
                ...shop,
                productsCount,
                followersCount,
                followingCount,
                rating: shop.rating || 0,
                reviewsCount: shop.reviewsCount || 0,
                isFollowing
            };
        }));

        res.status(200).json({
            success: true,
            data: shopsWithCounts
        });
    } catch (error) {
        next(error);
    }
};

export const getShopById = async (req, res, next) => {
    try {
        const shop = await prisma.shop.findUnique({ where: { id: req.params.id } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const productsCount = await prisma.product.count({ where: { shopId: shop.id } });
        const followersCount = await prisma.shop.findUnique({
            where: { id: shop.id },
            include: { _count: { select: { followers: true } } }
        }).then(s => s?._count?.followers || 0);
        const followingCount = await prisma.shop.count({ where: { followers: { some: { id: shop.ownerId } } } });
        let isFollowing = false;
        try {
            const auth = req.headers?.authorization;
            if (auth?.startsWith('Bearer ')) {
                const token = auth.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                const userId = decoded?.userId;
                if (userId) {
                    const rel = await prisma.shop.findFirst({ where: { id: shop.id, followers: { some: { id: userId } } }, select: { id: true } });
                    isFollowing = Boolean(rel);
                }
            }
        } catch (e) {
            isFollowing = false;
        }

        res.status(200).json({
            success: true,
            data: {
                ...shop,
                productsCount,
                followersCount,
                followingCount,
                rating: shop.rating || 0,
                reviewsCount: shop.reviewsCount || 0,
                isFollowing
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getShopByHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const productsCount = await prisma.product.count({ where: { shopId: shop.id } });
        const followersCount = await prisma.shop.findUnique({
            where: { id: shop.id },
            include: { _count: { select: { followers: true } } }
        }).then(s => s?._count?.followers || 0);
        const followingCount = await prisma.shop.count({ where: { followers: { some: { id: shop.ownerId } } } });
        let isFollowing = false;
        try {
            const auth = req.headers?.authorization;
            if (auth?.startsWith('Bearer ')) {
                const token = auth.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                const userId = decoded?.userId;
                if (userId) {
                    const rel = await prisma.shop.findFirst({ where: { id: shop.id, followers: { some: { id: userId } } }, select: { id: true } });
                    isFollowing = Boolean(rel);
                }
            }
        } catch (e) {
            isFollowing = false;
        }

        res.status(200).json({
            success: true,
            data: {
                ...shop,
                productsCount,
                followersCount,
                followingCount,
                rating: shop.rating || 0,
                reviewsCount: shop.reviewsCount || 0,
                isFollowing
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getShopReviewsByHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const reviews = await prisma.rating.findMany({
            where: { shopId: shop.id },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { name: true, email: true } } }
        });

        res.status(200).json({
            success: true,
            data: reviews
        });
    } catch (error) {
        next(error);
    }
};

export const getShopFollowersByHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const shop = await prisma.shop.findUnique({
            where: { username: username.toLowerCase() },
            include: { followers: { select: { id: true, name: true, email: true } } }
        });

        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({
            success: true,
            data: shop.followers || []
        });
    } catch (error) {
        next(error);
    }
};

export const getShopFollowingByHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const following = await prisma.shop.findMany({
            where: { followers: { some: { id: shop.ownerId } } },
            select: { id: true, name: true, description: true, username: true, isVerified: true, followersCount: true, avatar: true }
        });

        res.status(200).json({
            success: true,
            data: following || []
        });
    } catch (error) {
        next(error);
    }
};

export const updateShop = async (req, res, next) => {
    try {
        console.log("Update Shop Request Received:", {
            body: req.body,
            files: req.files ? Object.keys(req.files) : "No files"
        });

        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            console.log("Update Shop Error: Shop not found for owner", ownerId);
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const updateFields = ['name', 'username', 'description', 'category', 'address', 'phone', 'email'];
        const data = {};

        if (req.files) {
            if (req.files.avatar) {
                console.log("Uploading avatar to ImageKit...");
                const result = await uploadToImageKit(req.files.avatar[0], "duuka/avatars");
                data.avatar = result.url;
            }
            if (req.files.banner) {
                console.log("Uploading banner to ImageKit...");
                const result = await uploadToImageKit(req.files.banner[0], "duuka/banners");
                data.banner = result.url;
            }
        }
        
        if (req.body.username && req.body.username !== shop.username) {
            console.log("Checking username availability:", req.body.username);
            const existingShopWithUsername = await prisma.shop.findUnique({ where: { username: req.body.username.toLowerCase() } });
            if (existingShopWithUsername) {
                console.log("Username already taken:", req.body.username);
                const error = new Error('Username is already taken');
                error.statusCode = 400;
                throw error;
            }
        }

        updateFields.forEach(field => {
            if (req.body[field] !== undefined) {
                data[field] = field === 'username' ? req.body[field]?.toLowerCase() : req.body[field];
            }
        });

        console.log("Updating shop in database with data:", data);
        const updated = Object.keys(data).length > 0 ? await prisma.shop.update({ where: { id: shop.id }, data }) : shop;

        console.log("Shop updated successfully:", updated.id);
        
        // Invalidate shop caches
        await invalidateCache(`cache:/api/v1/shops/${shop.id}*`);
        await invalidateCache(`cache:/api/v1/shops/handle/${shop.username}*`);
        await invalidateCache("cache:/api/v1/shops?*");
        
        res.status(200).json({
            success: true,
            message: "Shop updated successfully",
            data: updated
        });
    } catch (error) {
        console.error("Update Shop Controller Error:", error);
        next(error);
    }
};

export const deleteShop = async (req, res, next) => {
    try {
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        await prisma.product.deleteMany({ where: { shopId: shop.id } });
        await prisma.shop.delete({ where: { id: shop.id } });

        // Invalidate shop and product caches
        await invalidateCache(`cache:/api/v1/shops/${shop.id}*`);
        await invalidateCache(`cache:/api/v1/shops/handle/${shop.username}*`);
        await invalidateCache("cache:/api/v1/shops*");
        await invalidateCache("cache:/api/v1/products*");

        res.status(200).json({
            success: true,
            message: "Shop and all associated products deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};

export const checkUsernameAvailability = async (req, res, next) => {
    try {
        const { username } = req.params;
        if (!username) {
            const error = new Error('Username is required');
            error.statusCode = 400;
            throw error;
        }

        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        
        res.status(200).json({
            success: true,
            available: !shop
        });
    } catch (error) {
        next(error);
    }
};

export const toggleFollowShop = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id || req.user?._id?.toString();

        const shop = await prisma.shop.findUnique({ where: { id } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        if (shop.ownerId === userId) {
            const error = new Error('You cannot follow your own shop');
            error.statusCode = 400;
            throw error;
        }

        const isFollowing = await prisma.shop.findFirst({
            where: { id, followers: { some: { id: userId } } }
        });

        if (isFollowing) {
            await prisma.shop.update({
                where: { id },
                data: { followers: { disconnect: { id: userId } } }
            });
        } else {
            await prisma.shop.update({
                where: { id },
                data: { followers: { connect: { id: userId } } }
            });
        }

        const updated = await prisma.shop.findUnique({
            where: { id },
            include: { _count: { select: { followers: true } } }
        });

        // Invalidate shop caches after follow/unfollow
        await invalidateCache(`cache:/api/v1/shops/${id}*`);

        res.status(200).json({
            success: true,
            message: isFollowing ? "Unfollowed shop successfully" : "Followed shop successfully",
            isFollowing: !isFollowing,
            followersCount: updated?._count?.followers || 0
        });
    } catch (error) {
        next(error);
    }
};

export const getShopFollowers = async (req, res, next) => {
    try {
        const { id } = req.params;
        const shop = await prisma.shop.findUnique({
            where: { id },
            include: { followers: { select: { id: true, name: true, email: true } } }
        });

        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({
            success: true,
            data: shop.followers || []
        });
    } catch (error) {
        next(error);
    }
};

export const getShopFollowing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const shop = await prisma.shop.findUnique({ where: { id } });
        
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const following = await prisma.shop.findMany({
            where: { followers: { some: { id: shop.ownerId } } },
            select: { id: true, name: true, description: true, username: true, isVerified: true, followersCount: true, avatar: true }
        });

        res.status(200).json({
            success: true,
            data: following || []
        });
    } catch (error) {
        next(error);
    }
};

export const getShopReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const reviews = await prisma.rating.findMany({
            where: { shopId: id },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { name: true, email: true } } }
        });

        res.status(200).json({
            success: true,
            data: reviews
        });
    } catch (error) {
        next(error);
    }
};

export const rateShop = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user?.id || req.user?._id?.toString();

        if (!rating || rating < 1 || rating > 5) {
            const error = new Error('Please provide a rating between 1 and 5');
            error.statusCode = 400;
            throw error;
        }

        const shop = await prisma.shop.findUnique({ where: { id } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        if (shop.ownerId === userId) {
            const error = new Error('You cannot rate your own shop');
            error.statusCode = 400;
            throw error;
        }

        await prisma.rating.upsert({
            where: { unique_shop_user_rating: { shopId: id, userId } },
            update: { rating, comment },
            create: { shopId: id, userId, rating, comment }
        });

        const agg = await prisma.rating.aggregate({
            where: { shopId: id },
            _avg: { rating: true },
            _count: { rating: true }
        });
        const averageRating = agg._avg.rating || 0;
        const reviewsCount = agg._count.rating || 0;

        await prisma.shop.update({
            where: { id },
            data: { rating: averageRating, reviewsCount }
        });

        // Invalidate shop cache after rating
        await invalidateCache(`cache:/api/v1/shops/${id}*`);

        res.status(200).json({
            success: true,
            message: "Shop rated successfully",
            data: {
                rating: averageRating,
                reviewsCount
            }
        });
    } catch (error) {
        next(error);
    }
};

export const rateShopByHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const { rating, comment } = req.body;
        const userId = req.user?.id || req.user?._id?.toString();
        if (!rating || rating < 1 || rating > 5) {
            const error = new Error('Please provide a rating between 1 and 5');
            error.statusCode = 400;
            throw error;
        }
        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }
        if (shop.ownerId === userId) {
            const error = new Error('You cannot rate your own shop');
            error.statusCode = 400;
            throw error;
        }
        await prisma.rating.upsert({
            where: { unique_shop_user_rating: { shopId: shop.id, userId } },
            update: { rating, comment },
            create: { shopId: shop.id, userId, rating, comment }
        });
        const agg = await prisma.rating.aggregate({
            where: { shopId: shop.id },
            _avg: { rating: true },
            _count: { rating: true }
        });
        const averageRating = agg._avg.rating || 0;
        const reviewsCount = agg._count.rating || 0;
        await prisma.shop.update({
            where: { id: shop.id },
            data: { rating: averageRating, reviewsCount }
        });

        // Invalidate shop cache after rating
        await invalidateCache(`cache:/api/v1/shops/${shop.id}*`);
        await invalidateCache(`cache:/api/v1/shops/handle/${username}*`);

        res.status(200).json({
            success: true,
            message: "Shop rated successfully",
            data: {
                rating: averageRating,
                reviewsCount
            }
        });
    } catch (error) {
        next(error);
    }
};
