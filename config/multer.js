const multer = require('multer');
const path = require('path');

// Define storage for the images
const storage = multer.diskStorage({
  // Destination for files
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },

  // Add back the extension and ensure the filename is unique
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  },
});

// Upload parameters for multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1024 * 1024 * 3, // 3MB file size limit
  },
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);

    if (mimeType && extName) {
      return cb(null, true);
    } else {
      cb('Error: Images Only!');
    }
  },
});

module.exports = upload;
