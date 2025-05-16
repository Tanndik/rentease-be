import express from "express";
import {
  getAllCars,
  getCarById,
  createCar,
  updateCar,
  deleteCar,
  getMyCars
} from "../controllers/car.js";
import { authMiddleware, sellerMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// Logging middleware for debugging
const logRequestMiddleware = (req, res, next) => {
  console.log("Request URL:", req.url);
  console.log("Request Method:", req.method);
  console.log("Request Headers:", req.headers);
  console.log("Request Body:", req.body);
  next();
};

// Public routes
router.get("/", getAllCars);

// IMPORTANT: Fixed route order - specific routes must come before parameter routes
router.use(logRequestMiddleware);
router.use(authMiddleware);
router.get("/my-cars", getMyCars);  // This specific path must come before /:id

// Generic routes with params must come last
router.get("/:id", getCarById);

// Other protected routes
router.post("/", sellerMiddleware, createCar);
router.put("/:id", updateCar);
router.delete("/:id", deleteCar);

export default router;