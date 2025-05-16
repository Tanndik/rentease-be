import { PrismaClient } from "@prisma/client";
import {
  createMidtransTransaction,
  getMidtransTransactionStatus,
} from "../utils/midtrans.js";

const prisma = new PrismaClient();

// Create order
export const createOrder = async (req, res) => {
  try {
    const { carId, startDate, endDate, paymentMethod } = req.body;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();

    if (start < now) {
      return res
        .status(400)
        .json({ message: "Start date must be in the future" });
    }

    if (end <= start) {
      return res
        .status(400)
        .json({ message: "End date must be after start date" });
    }

    // Find car
    const car = await prisma.car.findUnique({
      where: { id: carId },
      include: { owner: true },
    });

    if (!car) {
      return res.status(404).json({ message: "Car not found" });
    }

    if (!car.isAvailable) {
      return res.status(400).json({ message: "Car is not available for rent" });
    }

    // Check if car is already booked for the selected dates
    const conflictingOrders = await prisma.order.findMany({
      where: {
        carId,
        status: { in: ["PENDING", "CONFIRMED", "ONGOING"] },
        OR: [
          {
            startDate: { lte: end },
            endDate: { gte: start },
          },
        ],
      },
    });

    if (conflictingOrders.length > 0) {
      return res
        .status(400)
        .json({ message: "Car is not available for the selected dates" });
    }

    // Calculate total price
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const totalPrice = car.price * days;

    // Create order
    const order = await prisma.order.create({
      data: {
        startDate: start,
        endDate: end,
        totalPrice,
        paymentMethod,
        customerId: req.user.id,
        sellerId: car.owner.id,
        carId,
      },
    });
    if (
      paymentMethod === "VIRTUAL_ACCOUNT" ||
      paymentMethod === "CREDIT_CARD" ||
      paymentMethod === "E_WALLET"
    ) {
      try {
        const customer = await prisma.user.findUnique({
          where: { id: req.user.id },
        });

        const paymentData = {
          orderId: order.id,
          amount: totalPrice,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phoneNumber || "08123456789", // Provide default if missing
          description: `Car rental: ${car.brand} ${car.model} (${car.licensePlate})`,
        };

        const payment = await createMidtransTransaction(paymentData);

        // Update order with payment information
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentToken: payment.token,
            paymentUrl: payment.redirect_url,
          },
        });

        order.paymentToken = payment.token;
        order.paymentUrl = payment.redirect_url;
      } catch (error) {
        console.error("Payment creation error:", error);

        // Still create the order, but mark the payment issue
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: "PENDING",
            paymentStatus: "UNPAID",
          },
        });
      }
    }

    res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get orders for customer
export const getCustomerOrders = async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: req.user.id },
      include: {
        car: true,
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(orders);
  } catch (error) {
    console.error("Get customer orders error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get orders for seller
export const getSellerOrders = async (req, res) => {
  try {
    // Check if user is a seller
    if (req.user.role !== "SELLER") {
      return res.status(403).json({ message: "Access denied" });
    }

    const orders = await prisma.order.findMany({
      where: { sellerId: req.user.id },
      include: {
        car: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json(orders);
  } catch (error) {
    console.error("Get seller orders error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        car: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is related to this order
    if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check payment status with Midtrans for specific payment methods
    if (
      ["VIRTUAL_ACCOUNT", "CREDIT_CARD", "E_WALLET"].includes(
        order.paymentMethod
      ) &&
      order.paymentStatus !== "PAID"
    ) {
      try {
        // Get transaction status from Midtrans
        const transactionStatus = await getMidtransTransactionStatus(order.id);

        // Update payment status if needed
        if (
          (transactionStatus.transaction_status === "capture" ||
            transactionStatus.transaction_status === "settlement") &&
          transactionStatus.fraud_status === "accept"
        ) {
          // Update order payment status
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "PAID" },
          });

          // Update the response object
          order.paymentStatus = "PAID";
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
        // Continue with the response, don't fail the request
      }
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Get order by ID error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // First check if order exists
    const order = await prisma.order.findUnique({
      where: { id },
      include: { car: true },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is related to this order (security check)
    if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Validate status change
    const validStatuses = [
      "PENDING",
      "CONFIRMED",
      "ONGOING",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Validate status flow (prevent invalid state transitions)
    const currentStatus = order.status;
    const isValidTransition = validateStatusTransition(currentStatus, status);

    if (!isValidTransition) {
      return res.status(400).json({
        message: `Cannot change order status from ${currentStatus} to ${status}`,
      });
    }

    // Only seller can confirm, start or complete orders
    if (
      ["CONFIRMED", "ONGOING", "COMPLETED"].includes(status) &&
      req.user.id !== order.sellerId
    ) {
      return res
        .status(403)
        .json({ message: "Only the seller can update this order status" });
    }

    // Only customer can cancel pending orders
    if (
      status === "CANCELLED" &&
      currentStatus === "PENDING" &&
      req.user.id !== order.customerId
    ) {
      return res
        .status(403)
        .json({ message: "Only the customer can cancel pending orders" });
    }

    // For online payment methods, check payment with Midtrans before confirming
    if (
      status === "CONFIRMED" &&
      ["VIRTUAL_ACCOUNT", "CREDIT_CARD", "E_WALLET"].includes(
        order.paymentMethod
      ) &&
      order.paymentStatus !== "PAID"
    ) {
      try {
        // Get transaction status from Midtrans
        const transactionStatus = await getMidtransTransactionStatus(order.id);

        // If payment is successful, update payment status
        if (
          ["capture", "settlement"].includes(
            transactionStatus.transaction_status
          ) &&
          (transactionStatus.fraud_status === "accept" ||
            !transactionStatus.fraud_status)
        ) {
          // Update order payment status
          await prisma.order.update({
            where: { id: order.id },
            data: { paymentStatus: "PAID" },
          });

          // Continue with status update
          console.log(
            "Payment verified with Midtrans, continuing with order confirmation"
          );
        } else if (transactionStatus.transaction_status === "not_found") {
          console.log(
            "Transaction not found in Midtrans. Order might be using different payment method."
          );

          // Check if we should allow this based on business rules
          // For now, allow it but you might want to add additional checks
        } else {
          // Payment not confirmed by Midtrans
          return res.status(400).json({
            message: "Payment must be completed before confirming order",
            status: transactionStatus.transaction_status,
          });
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
        // For development purposes, you might want to continue anyway
        // In production, you should return an error
        if (process.env.NODE_ENV === "production") {
          return res.status(400).json({
            message: "Unable to verify payment status. Please try again later.",
          });
        } else {
          console.warn(
            "Continuing despite payment verification error (development mode)"
          );
        }
      }
    }

    // Update car availability when status changes to CONFIRMED or COMPLETED
    if (status === "CONFIRMED") {
      // Mark car as unavailable when rental is confirmed
      await prisma.car.update({
        where: { id: order.carId },
        data: { isAvailable: false },
      });
    } else if (status === "COMPLETED") {
      // Mark car as available again when rental is completed
      await prisma.car.update({
        where: { id: order.carId },
        data: { isAvailable: true },
      });
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { status },
      include: { car: true },
    });

    // Send response
    res.status(200).json({
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Update order status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Helper function to validate status transitions
function validateStatusTransition(currentStatus, newStatus) {
  // Define valid transitions
  const validTransitions = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["ONGOING", "CANCELLED"],
    ONGOING: ["COMPLETED", "CANCELLED"],
    COMPLETED: [], // Terminal state, no further transitions
    CANCELLED: [], // Terminal state, no further transitions
  };

  // Check if transition is allowed
  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

// For reference, add the webhook handler
export const handlePaymentWebhook = async (req, res) => {
  try {
    const notification = req.body;
    console.log("Received payment notification:", notification);

    // Get order ID from notification
    const orderId = notification.order_id;

    // Find the order in the database
    const order = await prisma.order.findFirst({
      where: {
        id: {
          contains: orderId.replace("ORDER-", ""),
        },
      },
    });

    if (!order) {
      console.log(`Order not found for ID: ${orderId}`);
      return res.status(404).json({ message: "Order not found" });
    }

    // Process based on transaction status
    const transactionStatus = notification.transaction_status;
    const fraudStatus = notification.fraud_status;

    if (
      (transactionStatus === "capture" || transactionStatus === "settlement") &&
      (fraudStatus === "accept" || !fraudStatus)
    ) {
      // Payment successful
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID" },
      });

      console.log(`Order ${order.id} marked as PAID`);
    } else if (
      transactionStatus === "cancel" ||
      transactionStatus === "deny" ||
      transactionStatus === "expire"
    ) {
      // Payment failed
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED" },
      });

      console.log(`Order ${order.id} marked as FAILED`);
    }

    res.status(200).json({ status: "OK" });
  } catch (error) {
    console.error("Payment webhook processing error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Manual check payment status
export const checkPaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is related to this order
    if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (
      !["VIRTUAL_ACCOUNT", "CREDIT_CARD", "E_WALLET"].includes(
        order.paymentMethod
      )
    ) {
      return res
        .status(400)
        .json({ message: "This order doesn't use online payment" });
    }

    try {
      // Get transaction status from Midtrans
      const transactionStatus = await getMidtransTransactionStatus(order.id);

      let paymentStatus = order.paymentStatus;

      // Update payment status based on Midtrans response
      if (
        (transactionStatus.transaction_status === "capture" ||
          transactionStatus.transaction_status === "settlement") &&
        transactionStatus.fraud_status === "accept"
      ) {
        paymentStatus = "PAID";

        // Update in database
        await prisma.order.update({
          where: { id },
          data: { paymentStatus },
        });
      }

      res.status(200).json({
        message: "Payment status checked successfully",
        status: paymentStatus,
        midtransStatus: transactionStatus,
      });
    } catch (error) {
      console.error("Error checking payment status:", error);
      res.status(500).json({ message: "Error checking payment status" });
    }
  } catch (error) {
    console.error("Check payment status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
