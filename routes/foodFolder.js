const express = require('express');
const router = express.Router();
const User = require('../models/User');
const productController = require('../controllers/productController');
const upload = require('../config/multer');

// Import orderRoutes and use them here
const orderRoutes = require('./orderRoutes');

router.get('/home', (req, res) => {
    res.render('foodFolder/home', { title: 'Home', header: 'Welcome to home' });
});

router.get('/dashboard', (req, res) => {
    res.render('foodFolder/dashboard', { title: 'Dashboard', header: 'Welcome to Dashboard' });
});

// Use order routes under /orders path
router.use('/orders', orderRoutes);

router.get('/products', productController.getAllProductsPage);

// Route for getting all products as JSON
router.get('/products/api/products', productController.getAllProductsJSON);

// Route for getting a single product as JSON
router.get('/products/:id/json', productController.getProductJSON);

// CRUD Routes for products
router.post('/products', upload.array('images', 10), productController.createProduct);
router.put('/products/:id', upload.array('images', 10), productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

router.get('/users', async (req, res) => {
    try {
        const customers = await User.find({ role: 'customer' });
        const sellers = await User.find({ role: 'seller' });
        const staff = await User.find({ role: 'staff' }); // Fetch staff data
        res.render('foodFolder/users', { title: 'Users', header: 'User Management', customers, sellers, staff }); // Pass staff data to the template
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/reviews', (req, res) => {
    res.render('foodFolder/reviews', { title: 'Reviews', header: 'Review Management' });
});

router.get('/settings', (req, res) => {
    res.render('foodFolder/settings', { title: 'Settings', header: 'Settings' });
});

// Logout route
router.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

module.exports = router;
