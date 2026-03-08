import { Router } from "express";
import { createStory, getActiveStories, getMyStories, deleteStory, markUpdateAsViewed } from "../controllers/story.controller.js";
import authorize from "../middlewares/auth.middleware.js";
import { upload } from "../config/imagekit.js";
import cacheMiddleware from "../middlewares/cache.middleware.js";

const storyRouter = Router();

// Publicly available (but cached) feed of stories
storyRouter.get("/", cacheMiddleware(180), getActiveStories); // Cache for 3 minutes

// Authenticated endpoints for Shop owners
storyRouter.post("/", authorize, upload.single('media'), createStory);
storyRouter.get("/my-stories", authorize, getMyStories);
storyRouter.delete("/:id", authorize, deleteStory);
storyRouter.patch("/:id/view", authorize, markUpdateAsViewed);

export default storyRouter;
