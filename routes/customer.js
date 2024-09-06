const express = require('express');
const router = express.Router();

// const bcrypt = require('bcryptjs');
const bcrypt = require('bcryptjs');
const passport = require('passport');

const multer = require('multer');
const path = require('path');
const Customer = require('../models/Customer');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');
// const passport = require('passport');
// Set up Multer for invoice image upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/invoices'); // Ensure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Customer Login (public route)
router.get('/customer-login', (req, res) => {
  res.render('customer-login', { message: req.flash('error') });
});

// Customer Login POST handler
router.post('/customer-login', passport.authenticate('local', {
  successRedirect: '/customer/dashboard',
  failureRedirect: '/customer/customer-login',
  failureFlash: true
}));

// Customer Registration Route
// / Route to create a new customer
router.post('/register', async (req, res) => {
    try {
        const { username, email, phone, password, profilePicture, invoicePicture } = req.body;

        // Create a new customer
        const newCustomer = new Customer({
            username,
            email,
            phone,
            password,  // Include password in customer creation
            profilePicture,
            invoicePicture
        });

        // Save the customer to the database
        await newCustomer.save();

        res.status(201).json({ message: 'Customer registered successfully', customer: newCustomer });
    } catch (err) {
        console.error('Error registering customer:', err);
        res.status(500).json({ error: err.message });
    }
});


// Customer Dashboard (protected route)
router.get('/dashboard', ensureAuthenticated, ensureRole('customer'), async (req, res) => {
  try {
    const user = req.user; // Get the authenticated user from the request
    res.render('customer-dashboard', { user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route to update customer profile with invoice image
router.put('/update-profile', ensureAuthenticated, ensureRole('customer'), upload.single('invoiceImage'), async (req, res) => {
  try {
    const customerId = req.user._id;
    const invoiceImageUrl = req.file ? `/uploads/invoices/${req.file.filename}` : null;

    const updatedCustomer = await Customer.findByIdAndUpdate(customerId, { invoiceImage: invoiceImageUrl }, { new: true });

    if (!updatedCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: 'Profile updated successfully', customer: updatedCustomer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.redirect('/customer/customer-login');
  });
});

module.exports = router;
