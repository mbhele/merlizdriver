const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const upload = require('../config/multer'); // Ensure this is correctly configured

// Route for the main products page (HTML view)
router.get('/', productController.getAllProductsPage);

// Route for getting all products as JSON
router.get('/api/products', productController.getAllProductsJSON);

// Route for getting a single product as JSON
router.get('/:id/json', productController.getProductJSON);

// CRUD Routes
router.post('/', upload.array('images', 10), productController.createProduct); // Adjusted path to match the base route
router.put('/:id', upload.array('images', 10), productController.updateProduct); // Adjusted path
router.delete('/:id', productController.deleteProduct); // Adjusted path

module.exports = router;
