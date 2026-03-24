import { Router } from "express";
import { 
    createShop, 
    getMyShop, 
    getShopById, 
    updateShop, 
    deleteShop, 
    getShops, 
    toggleFollowShop, 
    getShopFollowers, 
    getShopFollowing,
    checkUsernameAvailability,
    rateShop,
    getShopReviews,
    getShopByHandle,
    getShopReviewsByHandle,
    getShopFollowersByHandle,
    getShopFollowingByHandle,
    rateShopByHandle
} from "../controllers/shop.controller.js";
import authorize from "../middlewares/auth.middleware.js";
import { upload } from "../config/imagekit.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";
import validate from "../middlewares/validate.middleware.js";
import { registerShopSchema, updateShopSchema } from "../validations/shop.validation.js";

const shopRouter = Router();

shopRouter.get("/", cacheMiddleware(300), getShops);
shopRouter.post("/", authorize, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
]), validate(registerShopSchema), createShop);
// Static/prefix routes MUST come before the /:id wildcard
shopRouter.get("/my-shop", authorize, getMyShop);
shopRouter.put("/my-shop", authorize, validate(updateShopSchema), updateShop);
shopRouter.put("/my-shop/branding", authorize, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
]), validate(updateShopSchema), updateShop);
shopRouter.delete("/my-shop", authorize, deleteShop);
shopRouter.get("/check-username/:username", checkUsernameAvailability);
shopRouter.get("/handle/:username", cacheMiddleware(600), getShopByHandle);
shopRouter.get("/handle/:username/reviews", cacheMiddleware(300), getShopReviewsByHandle);
shopRouter.get("/handle/:username/followers", cacheMiddleware(300), getShopFollowersByHandle);
shopRouter.get("/handle/:username/following", cacheMiddleware(300), getShopFollowingByHandle);
shopRouter.post("/handle/:username/rate", authorize, rateShopByHandle);
// Wildcard /:id routes come last
shopRouter.get("/:id", cacheMiddleware(600), getShopById);
shopRouter.post("/:id/follow", authorize, toggleFollowShop);
shopRouter.get("/:id/followers", cacheMiddleware(300), getShopFollowers);
shopRouter.get("/:id/following", cacheMiddleware(300), getShopFollowing);
shopRouter.get("/:id/reviews", cacheMiddleware(300), getShopReviews);
shopRouter.post("/:id/rate", authorize, rateShop);

export default shopRouter;
