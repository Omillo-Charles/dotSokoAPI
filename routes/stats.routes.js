import { Router } from "express";
import prisma from "../database/postgresql.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";

const statsRouter = Router();

// Cache stats for 5 minutes
statsRouter.get("/", cacheMiddleware(300), async (req, res, next) => {
    try {
        const [usersCount, shopsCount, productsCount] = await Promise.all([
            prisma.user.count(),
            prisma.shop.count(),
            prisma.product.count()
        ]);

        res.status(200).json({
            success: true,
            data: {
                users: usersCount,
                shops: shopsCount,
                products: productsCount
            }
        });
    } catch (error) {
        next(error);
    }
});

export default statsRouter;
