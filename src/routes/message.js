import express from "express";
import {
  sendMessage,
  getOrderMessages,
  getConversations,
  markMessagesAsRead,
} from "../controllers/message.js";
import { authMiddleware } from "../middlewares/auth.js";

const router = express.Router();

// All message routes require authentication
router.use(authMiddleware);
router.post("/", sendMessage);
router.get("/order/:orderId", getOrderMessages);
router.get("/conversations", getConversations);
router.put("/read", markMessagesAsRead);

export default router;
