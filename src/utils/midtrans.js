import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Midtrans configuration
const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const MIDTRANS_CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;
const MIDTRANS_IS_PRODUCTION = process.env.NODE_ENV === "production";

// Use the correct base URLs for API environment
const BASE_URL = MIDTRANS_IS_PRODUCTION
  ? "https://app.midtrans.com"
  : "https://app.sandbox.midtrans.com";

const API_URL = MIDTRANS_IS_PRODUCTION
  ? "https://api.midtrans.com"
  : "https://api.sandbox.midtrans.com";

// Snap API for payment pages
const MIDTRANS_SNAP_URL = `${BASE_URL}/snap/v1`;

// Core API for transaction status checks
const MIDTRANS_CORE_URL = `${API_URL}/v2`;

// Helper function to generate consistent order IDs
const formatOrderId = (orderId) => {
  // Strip any existing prefix to avoid duplication
  const cleanId = orderId.replace(/^ORDER-/, "");
  return `ORDER-${cleanId}`;
};

// Get Midtrans transaction status
export const getMidtransTransactionStatus = async (orderId) => {
  try {
    // Format the order ID consistently
    const formattedOrderId = formatOrderId(orderId);

    // Setup authentication for Midtrans API
    const auth = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");

    console.log(
      "Getting Midtrans transaction status for order:",
      formattedOrderId
    );
    console.log(
      "Request URL:",
      `${MIDTRANS_CORE_URL}/${formattedOrderId}/status`
    );

    // Make API request to Midtrans Status API (CORRECTED ENDPOINT)
    // The correct format is /{orderId}/status not /status/{orderId}
    const response = await axios.get(
      `${MIDTRANS_CORE_URL}/${formattedOrderId}/status`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        timeout: 10000, // Add timeout to prevent hanging requests
      }
    );

    // Check if response is successful
    if (response.status === 200) {
      console.log(
        "Midtrans transaction status fetched successfully:",
        response.data
      );
      return response.data;
    } else {
      console.error(
        "Midtrans unexpected response:",
        response.status,
        response.data
      );
      throw new Error("Failed to get transaction status");
    }
  } catch (error) {
    console.error(
      "Midtrans transaction status error:",
      error.response?.data || error.message
    );

    // Check if it's a 404 error specifically
    if (error.response?.status === 404) {
      console.error("Transaction not found in Midtrans system");
      return { transaction_status: "not_found" };
    }

    throw new Error("Failed to get transaction status");
  }
};

// Create Midtrans transaction - using SNAP API
export const createMidtransTransaction = async (paymentData) => {
  try {
    // Ensure orderId is a string and format it consistently
    const formattedOrderId = formatOrderId(String(paymentData.orderId));

    // Basic request data structure for Midtrans Snap API
    const requestData = {
      transaction_details: {
        order_id: formattedOrderId,
        gross_amount: parseInt(paymentData.amount), // Ensure this is an integer
      },
      customer_details: {
        first_name: paymentData.customerName || "Customer",
        email: paymentData.customerEmail || "",
        phone: paymentData.customerPhone || "",
      },
      item_details: [
        {
          id: paymentData.itemId || "1",
          price: parseInt(paymentData.amount),
          quantity: 1,
          name: paymentData.description || "Order Payment",
        },
      ],
      credit_card: {
        secure: true,
      },
    };

    // Setup authentication for Midtrans API
    const auth = Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString("base64");

    console.log("Making request to Midtrans Snap API");
    console.log("Request URL:", `${MIDTRANS_SNAP_URL}/transactions`);
    console.log("Request data:", JSON.stringify(requestData, null, 2));

    // Make API request to Midtrans Snap
    const response = await axios.post(
      `${MIDTRANS_SNAP_URL}/transactions`,
      requestData,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${auth}`,
        },
        timeout: 10000, // Add timeout to prevent hanging requests
      }
    );

    // Check if response is successful
    if (response.status === 201 || response.status === 200) {
      console.log("Midtrans payment created successfully:", response.data);

      // Return the necessary payment info - for Snap API
      return {
        token: response.data.token || "",
        redirect_url: response.data.redirect_url || "",
        status: "pending",
        order_id: formattedOrderId,
      };
    } else {
      console.error(
        "Midtrans unexpected response:",
        response.status,
        response.data
      );
      throw new Error("Failed to create payment link");
    }
  } catch (error) {
    console.error(
      "Midtrans payment link creation error:",
      error.response?.data || error.response?.status || error.message
    );
    throw new Error("Failed to create payment link");
  }
};
