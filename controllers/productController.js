const Product = require('../models/Product');
const cloudinary = require('../config/cloudinaryConfig');
const fs = require('fs');

// Get all products and render the page
exports.getAllProductsPage = async (req, res) => {
    try {
        const products = await Product.find(); // Fetch all products from the database
        res.render('foodFolder/products', {
            title: 'Products',
            header: 'Product Management',
            products,
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};

// Get all products as JSON
exports.getAllProductsJSON = async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get a single product as JSON
exports.getProductJSON = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }
        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createProduct = async (req, res) => {
  try {
      const { name, description, category, price, quantity, status } = req.body;

      console.log("Files received:", req.files);

      // Ensure files are uploaded before accessing them
      if (!req.files || req.files.length === 0) {
          return res.status(400).json({ message: 'No files uploaded' });
      }

      const imageUploadPromises = req.files.map(file => {
          return cloudinary.uploader.upload(file.path).then(result => {
              console.log("File uploaded to Cloudinary:", result.secure_url);
              fs.unlinkSync(file.path); // Clean up uploaded file after successful upload
              return result.secure_url;
          });
      });

      const imageUrls = await Promise.all(imageUploadPromises);

      const newProduct = new Product({
          name,
          description,
          category,
          price,
          quantity,
          status,
          images: imageUrls,
      });

      await newProduct.save();
      res.redirect('/foodFolder/products');
  } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: error.message });
  }
};


// Update a product
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, category, price, quantity, status } = req.body;

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.name = name || product.name;
    product.description = description || product.description;
    product.category = category || product.category;
    product.price = price || product.price;
    product.quantity = quantity || product.quantity;
    product.status = status || product.status;
    product.updatedAt = Date.now();

    if (req.files && req.files.length > 0) {
      const imageUploadPromises = req.files.map(file => {
        return cloudinary.uploader.upload(file.path).then(result => {
          fs.unlinkSync(file.path); // Delete the file after upload
          return result.secure_url;
        });
      });

      const imageUrls = await Promise.all(imageUploadPromises);
      product.images = imageUrls;
    }

    await product.save();
    res.redirect('/'); // Redirect to the root or the page that lists products
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: error.message });
  }
};
// Delete a product
exports.deleteProduct = async (req, res) => {
  try {
      const product = await Product.findByIdAndDelete(req.params.id);
      if (!product) {
          return res.status(404).json({ message: 'Product not found' });
      }

      res.redirect('/products'); // Ensure this path points to your product list page
  } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ message: error.message });
  }
};
