import express from "express";
import {
  getPaymentDetails,
  handlePaymentNotification,
} from "../controllers/payment.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// Get payment details for an order
router.get("/:orderId/details", authMiddleware, getPaymentDetails);

// Payment notification webhook from Midtrans
router.post("/notification", handlePaymentNotification);

export default router;
