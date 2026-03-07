import prisma from "../database/postgresql.js";
import { uploadToImageKit } from "../config/imagekit.js";
import { invalidateCache } from "../middlewares/cache.middleware.js";

export const trackActivity = async (req, res, next) => {
    try {
        const { type, productId, category, searchQuery } = req.body;
        const userId = req.user ? (req.user.id || req.user._id?.toString()) : null;

        if (!userId) {
            // Skip tracking for guests for now, or you could implement anonymous tracking
            return res.status(200).json({
                success: true,
                message: "Activity skipped for guest"
            });
        }

        // Weights for different activities
        const weights = {
            view: 1,
            click: 2,
            search: 3,
            wishlist: 5,
            cart: 7,
            purchase: 10
        };

        const activity = await prisma.activity.create({
            data: {
                userId,
                type,
                productId,
                category,
                searchQuery,
                weight: weights[type] || 1
            }
        });

        res.status(201).json({
            success: true,
            data: activity
        });
    } catch (error) {
        next(error);
    }
};

export const getPersonalizedFeed = async (req, res, next) => {
    try {
        const userId = req.user ? (req.user.id || req.user._id?.toString()) : null;
        const { limit = 12 } = req.query;
        const limitValue = parseInt(limit) || 12;

        if (!userId) {
            const products = await prisma.product.findMany({
                orderBy: { createdAt: 'desc' },
                take: limitValue,
                include: { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } }
            });
            
            return res.status(200).json({ success: true, data: products });
        }

        const recentActivities = await prisma.activity.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        if (recentActivities.length === 0) {
            const products = await prisma.product.findMany({
                orderBy: { createdAt: 'desc' },
                take: limitValue,
                include: { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } }
            });
            return res.status(200).json({ success: true, data: products });
        }

        const categoryWeights = {};
        const productWeights = {};

        recentActivities.forEach(activity => {
            if (activity.category) {
                categoryWeights[activity.category] = (categoryWeights[activity.category] || 0) + activity.weight;
            }
            if (activity.productId) {
                productWeights[activity.productId] = (productWeights[activity.productId] || 0) + activity.weight;
            }
        });

        const sortedCategories = Object.entries(categoryWeights)
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        const topCategories = sortedCategories.slice(0, 3);
        
        let products = await prisma.product.findMany({
            include: { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } }
        });

        const scoredProducts = products.map(product => {
            let score = 0;
            
            const catIndex = topCategories.indexOf(product.category);
            if (catIndex !== -1) {
                score += (3 - catIndex) * 10; // 30 for top cat, 20 for second, 10 for third
            }

            if (productWeights[product.id]) {
                score += productWeights[product.id] * 2;
            }

            const daysOld = (Date.now() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 20 - daysOld); // Up to 20 points for new products

            return { product, score };
        });

        const finalProducts = scoredProducts
            .sort((a, b) => b.score - a.score)
            .slice(0, limitValue)
            .map(item => item.product);

        res.status(200).json({
            success: true,
            data: finalProducts
        });
    } catch (error) {
        console.error("Error in getPersonalizedFeed:", error);
        next(error);
    }
};

export const rateProduct = async (req, res, next) => {
    try {
        const { id: productId } = req.params;
        const { rating } = req.body;
        const userId = req.user?.id || req.user?._id?.toString();

        if (!rating || rating < 1 || rating > 5) {
            const error = new Error('Please provide a valid rating between 1 and 5');
            error.statusCode = 400;
            throw error;
        }

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            const error = new Error('Product not found');
            error.statusCode = 404;
            throw error;
        }

        await prisma.rating.upsert({
            where: { unique_product_user_rating: { productId, userId } },
            update: { rating },
            create: { productId, userId, rating }
        });

        const agg = await prisma.rating.aggregate({
            where: { productId },
            _avg: { rating: true },
            _count: { rating: true }
        });
        const reviewsCount = agg._count.rating || 0;
        const averageRating = agg._avg.rating || 0;

        await prisma.product.update({
            where: { id: productId },
            data: { rating: averageRating, reviewsCount }
        });

        // Invalidate product cache after rating
        await invalidateCache(`cache:/api/v1/products/${productId}*`);

        res.status(200).json({
            success: true,
            message: "Rating submitted successfully",
            data: {
                rating: averageRating,
                reviewsCount
            }
        });
    } catch (error) {
        next(error);
    }
};

export const createProduct = async (req, res, next) => {
    try {
        const { name, description, content, price, category, stock, sizes, colors } = req.body;
        
        console.log("Create Product Request:", { 
            name, 
            price, 
            stock, 
            files: req.files ? req.files.length : 0 
        });

        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            console.error("Create Product Error: Shop not found for owner", ownerId);
            const error = new Error('User does not have a shop. Please register a shop first.');
            error.statusCode = 403;
            throw error;
        }

        let images = [];
        if (req.files && req.files.length > 0) {
            console.log("Uploading product images to ImageKit...");
            try {
                const uploadPromises = req.files.map(file => uploadToImageKit(file, "duuka/products"));
                const results = await Promise.all(uploadPromises);
                images = results.map(result => result.url);
                console.log("Successfully uploaded images:", images);
            } catch (uploadError) {
                console.error("ImageKit upload failed during product creation:", uploadError);
                throw uploadError;
            }
        } else if (req.body.image) {
            images = [req.body.image];
        }

        if (images.length === 0) {
            const error = new Error('Please upload at least one image or provide an image link.');
            error.statusCode = 400;
            throw error;
        }

        let parsedSizes = [];
        let parsedColors = [];
        
        if (sizes && typeof sizes === 'string' && sizes.trim() !== '') {
            try {
                parsedSizes = JSON.parse(sizes);
            } catch (e) {
                parsedSizes = sizes.split(',').map(s => s.trim());
            }
        } else if (Array.isArray(sizes)) {
            parsedSizes = sizes;
        }

        if (colors && typeof colors === 'string' && colors.trim() !== '') {
            try {
                parsedColors = JSON.parse(colors);
            } catch (e) {
                parsedColors = colors.split(',').map(c => c.trim());
            }
        } else if (Array.isArray(colors)) {
            parsedColors = colors;
        }

        images = images.slice(0, 3);
        
        console.log("Creating product in Prisma with data:", {
            shopId: shop.id,
            name,
            price: parseFloat(price),
            stock: parseInt(stock) || 1
        });

        const product = await prisma.product.create({
            data: {
                shopId: shop.id,
                name,
                description,
                content: content || description,
                price: parseFloat(price) || 0,
                category,
                stock: parseInt(stock) || 1,
                image: images[0],
                images,
                sizes: parsedSizes,
                colors: parsedColors
            }
        });

        console.log("Product created successfully:", product.id);

        // Invalidate product caches
        await invalidateCache("cache:/api/v1/products*");
        await invalidateCache("cache:/api/v1/products/feed*");

        res.status(201).json({
            success: true,
            message: "Product posted successfully",
            data: product
        });
    } catch (error) {
        console.error("Create Product Controller Error:", error);
        next(error);
    }
};

export const getProducts = async (req, res, next) => {
    try {
        const { q, cat, shop, minPrice, maxPrice, limit, page = 1 } = req.query;
        const where = {};

        if (q) {
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } }
            ];
        }

        if (cat && cat !== 'all') {
            where.category = cat;
        }

        if (shop) {
            where.shopId = shop;
        }

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }

        const limitValue = parseInt(limit);
        const pageValue = parseInt(page) || 1;
        const skipValue = (pageValue - 1) * (limitValue > 0 ? limitValue : 100);

        const commonInclude = { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } };
        let products;

        if (limitValue > 0) {
            products = await prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limitValue,
                skip: skipValue,
                include: commonInclude
            });
        } else if (limitValue === -1) {
            products = await prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                include: commonInclude
            });
        } else {
            products = await prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 100,
                skip: skipValue,
                include: commonInclude
            });
        }

        const total = await prisma.product.count({ where });

        res.status(200).json({
            success: true,
            data: products,
            pagination: limitValue > 0 ? {
                total,
                page: pageValue,
                limit: limitValue,
                pages: Math.ceil(total / limitValue)
            } : (limitValue === -1 ? {
                total: products.length,
                page: 1,
                limit: products.length,
                pages: 1
            } : {
                total,
                page: pageValue,
                limit: 100,
                pages: Math.ceil(total / 100)
            })
        });
    } catch (error) {
        console.error("Error in getProducts:", error);
        next(error);
    }
};

export const getProductsByShopId = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { minPrice, maxPrice, limit, page = 1 } = req.query;
        
        const limitValue = parseInt(limit);
        const pageValue = parseInt(page) || 1;
        const skipValue = (pageValue - 1) * (limitValue > 0 ? limitValue : 100);

        const where = { shopId: id };

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }

        const include = { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } };
        let products;

        if (limitValue > 0) {
            products = await prisma.product.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limitValue,
                skip: skipValue,
                include
            });
        } else if (limitValue === -1) {
            products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, include });
        } else {
            products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, skip: skipValue, include });
        }

        const total = await prisma.product.count({ where });

        res.status(200).json({
            success: true,
            data: products,
            pagination: limitValue > 0 ? {
                total,
                page: pageValue,
                limit: limitValue,
                pages: Math.ceil(total / limitValue)
            } : (limitValue === -1 ? {
                total: products.length,
                page: 1,
                limit: products.length,
                pages: 1
            } : {
                total,
                page: pageValue,
                limit: 100,
                pages: Math.ceil(total / 100)
            })
        });
    } catch (error) {
        console.error("Error in getProductsByShopId:", error);
        next(error);
    }
};

export const getProductsByShopHandle = async (req, res, next) => {
    try {
        const { username } = req.params;
        const { minPrice, maxPrice, limit, page = 1 } = req.query;

        const shop = await prisma.shop.findUnique({ where: { username: username.toLowerCase() } });
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }
        
        const limitValue = parseInt(limit);
        const pageValue = parseInt(page) || 1;
        const skipValue = (pageValue - 1) * (limitValue > 0 ? limitValue : 100);

        const where = { shopId: shop.id };

        if (minPrice || maxPrice) {
            where.price = {};
            if (minPrice) where.price.gte = parseFloat(minPrice);
            if (maxPrice) where.price.lte = parseFloat(maxPrice);
        }

        const include = { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } };
        let products;

        if (limitValue > 0) {
            products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, take: limitValue, skip: skipValue, include });
        } else if (limitValue === -1) {
            products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, include });
        } else {
            products = await prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, skip: skipValue, include });
        }

        const total = await prisma.product.count({ where });

        res.status(200).json({
            success: true,
            data: products,
            pagination: limitValue > 0 ? {
                total,
                page: pageValue,
                limit: limitValue,
                pages: Math.ceil(total / limitValue)
            } : (limitValue === -1 ? {
                total: products.length,
                page: 1,
                limit: products.length,
                pages: 1
            } : {
                total,
                page: pageValue,
                limit: 100,
                pages: Math.ceil(total / 100)
            })
        });
    } catch (error) {
        console.error("Error in getProductsByShopHandle:", error);
        next(error);
    }
};

export const getMyProducts = async (req, res, next) => {
    try {
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        if (!shop) {
            return res.status(200).json({ success: true, data: [] });
        }

        const products = await prisma.product.findMany({
            where: { shopId: shop.id },
            orderBy: { createdAt: 'desc' }
        });

        res.status(200).json({
            success: true,
            data: products
        });
    } catch (error) {
        next(error);
    }
};

export const getProductById = async (req, res, next) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { shop: { select: { name: true, username: true, avatar: true, isVerified: true } } }
        });
        if (!product) {
            const error = new Error('Product not found');
            error.statusCode = 404;
            throw error;
        }

        res.status(200).json({
            success: true,
            data: product
        });
    } catch (error) {
        next(error);
    }
};

export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, description, content, price, category, stock } = req.body;
        
        console.log("Update Product Request:", { id, name, price, stock });

        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        
        if (!shop) {
            console.error("Update Product Error: Shop not found for owner", ownerId);
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const product = await prisma.product.findUnique({ where: { id } });
        if (!product || product.shopId !== shop.id) {
            console.error("Update Product Error: Product not found or unauthorized", { id, shopId: shop.id });
            const error = new Error('Product not found or unauthorized');
            error.statusCode = 404;
            throw error;
        }

        const updates = { ...req.body };
        
        // Handle numeric fields
        if (price !== undefined) updates.price = parseFloat(price);
        if (stock !== undefined) updates.stock = parseInt(stock);
        
        if (req.body.sizes) {
            try {
                updates.sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
            } catch (e) {
                console.error("Error parsing sizes:", e);
                updates.sizes = typeof req.body.sizes === 'string' ? req.body.sizes.split(',').map(s => s.trim()) : req.body.sizes;
            }
        }
        if (req.body.colors) {
            try {
                updates.colors = typeof req.body.colors === 'string' ? JSON.parse(req.body.colors) : req.body.colors;
            } catch (e) {
                console.error("Error parsing colors:", e);
                updates.colors = typeof req.body.colors === 'string' ? req.body.colors.split(',').map(c => c.trim()) : req.body.colors;
            }
        }
        
        let currentImages = [];
        
        if (req.body.existingImages) {
            try {
                const existing = typeof req.body.existingImages === 'string' ? JSON.parse(req.body.existingImages) : req.body.existingImages;
                if (Array.isArray(existing)) {
                    currentImages = [...existing];
                }
            } catch (e) {
                console.error("Error parsing existingImages:", e);
            }
        }

        if (req.files && req.files.length > 0) {
            console.log("Uploading new product images to ImageKit (Update)...");
            try {
                const uploadPromises = req.files.map(file => uploadToImageKit(file, "duuka/products"));
                const results = await Promise.all(uploadPromises);
                const newImages = results.map(result => result.url);
                currentImages = [...currentImages, ...newImages];
                console.log("Successfully uploaded new images:", newImages);
            } catch (uploadError) {
                console.error("ImageKit upload failed during product update:", uploadError);
                throw uploadError;
            }
        }

        currentImages = currentImages.slice(0, 3);

        if (currentImages.length > 0) {
            updates.images = currentImages;
            updates.image = currentImages[0];
        }

        // Remove existingImages from updates as it's not in the Prisma model
        delete updates.existingImages;

        console.log("Updating product in Prisma with data:", updates);
        const updatedProduct = await prisma.product.update({
            where: { id },
            data: updates
        });

        console.log("Product updated successfully:", updatedProduct.id);

        // Invalidate specific product and list caches
        await invalidateCache(`cache:/api/v1/products/${id}*`);
        await invalidateCache("cache:/api/v1/products?*");
        await invalidateCache("cache:/api/v1/products/feed*");

        res.status(200).json({
            success: true,
            message: "Product updated successfully",
            data: updatedProduct
        });
    } catch (error) {
        console.error("Update Product Controller Error:", error);
        next(error);
    }
};

export const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const ownerId = req.user?.id || req.user?._id?.toString();
        const shop = await prisma.shop.findUnique({ where: { ownerId } });
        
        if (!shop) {
            const error = new Error('Shop not found');
            error.statusCode = 404;
            throw error;
        }

        const product = await prisma.product.findUnique({ where: { id } });
        if (!product || product.shopId !== shop.id) {
            const error = new Error('Product not found or unauthorized');
            error.statusCode = 404;
            throw error;
        }
        await prisma.product.delete({ where: { id } });

        // Invalidate product caches
        await invalidateCache(`cache:/api/v1/products/${id}*`);
        await invalidateCache("cache:/api/v1/products*");
        await invalidateCache("cache:/api/v1/products/feed*");

        res.status(200).json({
            success: true,
            message: "Product deleted successfully"
        });
    } catch (error) {
        next(error);
    }
};
