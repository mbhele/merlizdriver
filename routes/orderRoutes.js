const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Adjust the path as necessary

const Order = require('../models/Order'); // Ensure the correct path to your Order model
const Customer = require('../models/Customer'); // Ensure the correct path to your Customer model
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
const Product = require('../models/Product'); // Adjust the path as necessary

// Route to create a new order
router.post('/create', ensureAuthenticated, ensureRole('customer'), async (req, res) => {
  try {
    const { items, addressType, selectedAddress, totalAmount } = req.body;
    const customerId = req.user.id;

    // Initialize totalAmount to validate against the calculated total
    let calculatedTotal = 0;

    // Validate and update item details
    const updatedItems = await Promise.all(
      items.map(async item => {
        const product = await Product.findById(item.productId);
        if (!product || !product.available) {
          throw new Error(`Product ${item.name} is not available`);
        }
        
        // Check if the price matches the current product price
        if (item.price !== product.price) {
          throw new Error(`Price for ${item.name} does not match the current price.`);
        }

        // Accumulate the total amount
        calculatedTotal += product.price * item.quantity;

        return {
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          price: product.price,
        };
      })
    );

    // Validate the total amount
    if (totalAmount !== calculatedTotal) {
      return res.status(400).json({ error: 'Total amount does not match the sum of item prices.' });
    }

    // Create a new order
    const newOrder = new Order({
      customer: customerId,
      items: updatedItems,
      addressType,
      selectedAddress,
      totalAmount: calculatedTotal,
      status: 'Pending',
    });

    // Save the order
    const savedOrder = await newOrder.save();

   
    // Add the order to the customer's order list
    await User.findByIdAndUpdate(customerId, { $push: { orders: savedOrder._id } });

    res.status(201).json({ message: 'Order created successfully', order: savedOrder });
  } catch (err) {
    console.error('Order creation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



// PUT route to update order status
router.put('/update-status/:orderId', ensureAuthenticated, ensureRole('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.orderId;

    const updatedOrder = await Order.findByIdAndUpdate(orderId, { status }, { new: true });

    if (!updatedOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({ message: 'Order status updated successfully', order: updatedOrder });
  } catch (err) {
    console.error('Error occurred while updating order status:', err);
    res.status(500).json({ error: err.message });
  }
});
// Route to get all orders (Admin only)
router.get('/all', ensureAuthenticated, ensureRole('admin'), async (req, res) => {
  try {
    const orders = await Order.find().populate('customer', 'username email');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Route to get orders for a specific customer (Customer only)
router.get('/my-orders', ensureAuthenticated, ensureRole('customer'), async (req, res) => {
  try {
    const customerId = req.user._id;
    const orders = await Order.find({ customer: customerId });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to render the order management page
router.get('/', async (req, res) => {
  try {
    // Ensure that the customer is populated
    const orders = await Order.find().populate('customer', 'username email');

    // Check if the population worked correctly
    console.log(orders); // Log orders to verify if customer data is populated

    res.render('foodFolder/orders', { title: 'Orders', header: 'Order Management', orders });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
