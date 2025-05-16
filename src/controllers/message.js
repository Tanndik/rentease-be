import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Send message
export const sendMessage = async (req, res) => {
  try {
    const { orderId, receiverId, content } = req.body;

    // Validate input
    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ message: "Message content cannot be empty" });
    }

    // If orderId is provided, check if order exists and user is related to it
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Check if user is related to this order
      if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Determine receiver based on sender
      const autoReceiverId =
        req.user.id === order.customerId ? order.sellerId : order.customerId;

      // Create message
      const message = await prisma.message.create({
        data: {
          content,
          senderId: req.user.id,
          receiverId: receiverId || autoReceiverId,
          orderId,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Message sent successfully",
        data: message,
      });
    } else if (receiverId) {
      // Direct message without order
      const receiver = await prisma.user.findUnique({
        where: { id: receiverId },
      });

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }

      // Create message
      const message = await prisma.message.create({
        data: {
          content,
          senderId: req.user.id,
          receiverId,
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
            },
          },
          receiver: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.status(201).json({
        message: "Message sent successfully",
        data: message,
      });
    } else {
      return res
        .status(400)
        .json({ message: "Either orderId or receiverId must be provided" });
    }
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get messages for a specific order
export const getOrderMessages = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Check if order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if user is related to this order
    if (order.customerId !== req.user.id && order.sellerId !== req.user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get messages
    const messages = await prisma.message.findMany({
      where: { orderId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Get order messages error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get conversations (grouped by user)
export const getConversations = async (req, res) => {
  try {
    // Get all messages where user is sender or receiver
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: req.user.id }, { receiverId: req.user.id }],
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
          },
        },
        order: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Group messages by conversation partner
    const conversations = {};

    messages.forEach((message) => {
      const partnerId =
        message.senderId === req.user.id
          ? message.receiverId
          : message.senderId;
      const partnerName =
        message.senderId === req.user.id
          ? message.receiver.name
          : message.sender.name;

      if (!conversations[partnerId]) {
        conversations[partnerId] = {
          partnerId,
          partnerName,
          lastMessage: message,
          orderId: message.orderId,
          unreadCount:
            message.receiverId === req.user.id && !message.read ? 1 : 0,
        };
      } else if (
        message.createdAt > conversations[partnerId].lastMessage.createdAt
      ) {
        conversations[partnerId].lastMessage = message;
        if (message.receiverId === req.user.id && !message.read) {
          conversations[partnerId].unreadCount++;
        }
      }
    });

    res.status(200).json(Object.values(conversations));
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "Invalid message IDs" });
    }

    // Verify that user is the receiver of all messages
    const messages = await prisma.message.findMany({
      where: {
        id: { in: messageIds },
      },
    });

    const notOwnedMessages = messages.filter(
      (message) => message.receiverId !== req.user.id
    );
    if (notOwnedMessages.length > 0) {
      return res
        .status(403)
        .json({ message: "Access denied to some messages" });
    }

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        id: { in: messageIds },
        receiverId: req.user.id,
      },
      data: { read: true },
    });

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Mark messages as read error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
