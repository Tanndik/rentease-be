import express from "express";
import {
  getCurrentUserProfile,
  updateUserProfile,
  changeUserPassword,
} from "../controllers/user.js";

const router = express.Router();

// Get current user profile
router.get("/me", getCurrentUserProfile);

// Update user profile
router.put("/me", updateUserProfile);

// Change password
router.put("/me/password", changeUserPassword);

export default router;
