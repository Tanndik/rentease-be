import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import carRoutes from "./routes/car.js";
import orderRoutes from "./routes/order.js";
import messageRoutes from "./routes/message.js";
import paymentRoutes from "./routes/payment.js";
import { authMiddleware } from "./middlewares/auth.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cek route root
app.get("/", (req, res) => {
  res.send("Backend API is working");
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/orders", authMiddleware, orderRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);
app.use("/api/payments", paymentRoutes);

// Export app
export default app;
