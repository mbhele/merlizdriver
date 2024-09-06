const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const Product = require('../models/Product');

// Route to get all products in JSON format (API)
router.get('/', productController.getAllProductsJSON);

// Route to get a single product as JSON (API)
router.get('/:id', productController.getProductJSON);

// Route to create a new product (API)
router.post('/', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    res.status(201).json(newProduct); // Send a 201 status with the created product
  } catch (err) {
    res.status(400).json({ error: err.message }); // Handle any errors
  }
});

module.exports = router;
