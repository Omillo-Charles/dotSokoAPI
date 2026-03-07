import { Router } from "express";
import { createProduct, getProducts, getProductById, getMyProducts, updateProduct, deleteProduct, getProductsByShopId, rateProduct, getPersonalizedFeed, trackActivity, getProductsByShopHandle } from "../controllers/product.controller.js";
import authorize from "../middlewares/auth.middleware.js";
import { upload } from "../config/imagekit.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";

const productRouter = Router();

// Feed and Tracking
productRouter.get("/feed", (req, res, next) => {
    if (req.headers.authorization) {
        return authorize(req, res, next);
    }
    next();
}, cacheMiddleware(180), getPersonalizedFeed); // Cache for 3 minutes

productRouter.post("/track", (req, res, next) => {
    if (req.headers.authorization) {
        return authorize(req, res, next);
    }
    next();
}, trackActivity);

productRouter.post("/", authorize, upload.array('image', 3), createProduct);
productRouter.post("/:id/rate", authorize, rateProduct);
productRouter.get("/", cacheMiddleware(300), getProducts); // Cache for 5 minutes
productRouter.get("/shop/:id", cacheMiddleware(300), getProductsByShopId); // Cache for 5 minutes
productRouter.get("/shop/handle/:username", cacheMiddleware(300), getProductsByShopHandle); // Cache for 5 minutes
productRouter.get("/my-products", authorize, getMyProducts);
productRouter.get("/:id", cacheMiddleware(600), getProductById); // Cache for 10 minutes
productRouter.put("/:id", authorize, upload.array('image', 3), updateProduct);
productRouter.delete("/:id", authorize, deleteProduct);

export default productRouter;
