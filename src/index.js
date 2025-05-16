import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import carRoutes from "./routes/car.js";
import orderRoutes from "./routes/order.js";
import messageRoutes from "./routes/message.js";
import paymentRoutes from "./routes/payment.js";
import { authMiddleware } from "./middlewares/auth.js";

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const httpServer = createServer(app);

// Setup Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "development"
        ? "https://rentease-fe.vercel.app/"
        : "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/cars", carRoutes);
app.use("/api/orders", authMiddleware, orderRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);
app.use("/api/payments", paymentRoutes);

// Socket.IO connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join_room", (orderId) => {
    socket.join(orderId);
    console.log(`User ${socket.id} joined room: ${orderId}`);
  });

  socket.on("send_message", (messageData) => {
    io.to(messageData.orderId).emit("receive_message", messageData);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
