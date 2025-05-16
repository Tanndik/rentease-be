import express from 'express';
import { 
  createOrder, 
  getCustomerOrders, 
  getSellerOrders, 
  getOrderById, 
  updateOrderStatus, 
  handlePaymentWebhook 
} from '../controllers/order.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = express.Router();

// Public webhook route (no auth)
router.post('/payment-webhook', handlePaymentWebhook);

// Protected routes
router.use(authMiddleware);
router.post('/', createOrder);
router.get('/customer', getCustomerOrders);
router.get('/seller', getSellerOrders);
router.get('/:id', getOrderById);
router.put('/:id/status', updateOrderStatus);

export default router;