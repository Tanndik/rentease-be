import { PrismaClient } from "@prisma/client";
import { getMidtransTransactionStatus } from "../utils/midtrans.js";

const prisma = new PrismaClient();

// Get payment details for an order
export const getPaymentDetails = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        car: true,
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is related to this order
    if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Check if order has payment token
    if (!order.paymentToken) {
      return res.status(400).json({
        message: "No payment token found for this order",
        paymentUrl: order.paymentUrl,
      });
    }

    try {
      // Get transaction status from Midtrans
      const transactionStatus = await getMidtransTransactionStatus(
        order.paymentToken
      );

      // Include payment URL in the response
      if (order.paymentUrl) {
        transactionStatus.payment_url = order.paymentUrl;
      }

      // Return payment details
      res.status(200).json(transactionStatus);
    } catch (paymentError) {
      // If there's an error getting payment details but we have a payment URL,
      // return a specific error with the payment URL
      if (order.paymentUrl) {
        return res.status(400).json({
          message:
            "Unable to fetch payment details, please use the payment URL directly",
          paymentUrl: order.paymentUrl,
        });
      }

      throw paymentError; // Re-throw to be caught by the outer catch
    }
  } catch (error) {
    console.error("Get payment details error:", error);
    res.status(500).json({ message: "Failed to fetch payment details" });
  }
};

// Handle payment notification webhook from Midtrans
export const handlePaymentNotification = async (req, res) => {
  try {
    const notification = req.body;

    // Extract order ID from the notification
    const orderId = notification.order_id;

    // Find the order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Update payment status based on transaction status
    let paymentStatus = "UNPAID";

    if (
      notification.transaction_status === "capture" ||
      notification.transaction_status === "settlement" ||
      notification.status === "paid"
    ) {
      paymentStatus = "PAID";
    } else if (
      notification.transaction_status === "cancel" ||
      notification.transaction_status === "deny" ||
      notification.transaction_status === "expire" ||
      notification.status === "expired"
    ) {
      paymentStatus = "UNPAID";
    } else if (
      notification.transaction_status === "refund" ||
      notification.status === "refunded"
    ) {
      paymentStatus = "REFUNDED";
    }

    // Update order payment status
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus },
    });

    // Return success
    res.status(200).json({ status: "ok" });
  } catch (error) {
    console.error("Payment notification webhook error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
