const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const multer = require('multer');
const streamifier = require('streamifier');
const { v2: cloudinary } = require('cloudinary');
const Driver = require('../models/Driver');
const User = require('../models/User');
const Trip = require('../models/Trip');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

const router = express.Router();
const upload = multer();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Function to upload an image to Cloudinary
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image' },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error('Failed to upload image to Cloudinary.'));
        } else {
          resolve(result.secure_url);
        }
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

// Driver Registration Route
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, phone, vehicleMake, vehicleModel, plateNumber, idNumber, homeAddress } = req.body;

    if (!username || !email || !password || !phone || !vehicleMake || !vehicleModel || !plateNumber || !idNumber || !homeAddress) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: 'driver',
    });

    await newUser.save();

    const newDriver = new Driver({
      userId: newUser._id,
      name: username,
      email,
      phone,
      vehicle: {
        make: vehicleMake,
        model: vehicleModel,
        plateNumber: plateNumber,
      },
      availability: true,
      currentLocation: { type: 'Point', coordinates: [0, 0] },  // Set type and coordinates
      idNumber,
      homeAddress,
    });

    await newDriver.save();

    const token = generateToken(newUser);

    res.status(201).json({ message: 'Driver registered successfully', token, driver: newDriver });
  } catch (error) {
    console.error('Error in registration route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Driver Login Route
router.post('/login', (req, res, next) => {
  passport.authenticate('local', { usernameField: 'username' }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ message: 'User not found' });

    if (user.role === 'driver') {
      req.login(user, async (err) => {
        if (err) return res.status(500).json({ error: err.message });

        const driver = await Driver.findOne({ userId: user._id });
        if (!driver) {
          return res.status(404).json({ message: 'Driver not found' });
        }

        // Update lastActive field
        driver.lastActive = new Date();
        await driver.save();

        const token = generateToken(user);
        res.status(200).json({ token, driver });
      });
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }
  })(req, res, next);
});

// Endpoint to store the driver's push token
router.post('/register-push-token', async (req, res) => {
  const { driverId, token } = req.body;

  try {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.pushToken = token;
    await driver.save();

    res.status(200).json({ message: 'Push token registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error, unable to save push token' });
  }
});

// Route to check if a driver has a push token
router.get('/check-push-token/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const driver = await Driver.findById(driverId);

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (driver.pushToken) {
      return res.status(200).json({ message: 'Token found', pushToken: driver.pushToken });
    } else {
      return res.status(404).json({ message: 'No token found for this driver' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
// Fetch Driver's Own Profile
router.get('/me', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    console.log('Received GET request to /driver/me'); // Log request receipt

    const driver = await Driver.findOne({ userId: req.user.id }).populate('userId', 'username email');
    
    if (!driver) {
      console.log('Driver not found for user ID:', req.user.id); // Log missing driver
      return res.status(404).json({ message: 'Driver not found' });
    }

    console.log('Fetched driver data:', driver); // Log fetched driver data
    res.status(200).json(driver);
  } catch (error) {
    console.error('Error fetching driver data:', error); // Log any errors
    res.status(500).json({ message: 'Failed to fetch driver data', error: error.message });
  }
});


// Combined Route for Updating Driver Profile and Uploading License Images
router.put('/me', ensureAuthenticated, ensureRole(['driver']), upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'licenseFront', maxCount: 1 },
  { name: 'licenseBack', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Received PUT request to /driver/me'); // Log request
    console.log('Request body:', req.body); // Log body data
    console.log('Request files:', req.files); // Log files data

    const { name, email, phone, vehicle, homeAddress, idNumber } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Handle profile image upload
    let profilePictureUrl = driver.profilePicture; // Default to existing profile picture
    if (req.files.profileImage && req.files.profileImage.length > 0) {
      profilePictureUrl = await uploadToCloudinary(req.files.profileImage[0].buffer);
    }

    // Handle license images upload
    let licenseFrontUrl = driver.licenseFront; // Default to existing license front
    if (req.files.licenseFront && req.files.licenseFront.length > 0) {
      licenseFrontUrl = await uploadToCloudinary(req.files.licenseFront[0].buffer);
    }

    let licenseBackUrl = driver.licenseBack; // Default to existing license back
    if (req.files.licenseBack && req.files.licenseBack.length > 0) {
      licenseBackUrl = await uploadToCloudinary(req.files.licenseBack[0].buffer);
    }

    // Update user and driver details
    user.username = name || user.username;
    user.email = email || user.email;
    driver.name = name || driver.name;
    driver.email = email || driver.email;
    driver.phone = phone || driver.phone;
    driver.vehicle = vehicle || driver.vehicle;
    driver.profilePicture = profilePictureUrl;
    driver.licenseFront = licenseFrontUrl;
    driver.licenseBack = licenseBackUrl;
    driver.homeAddress = homeAddress || driver.homeAddress;
    driver.idNumber = idNumber || driver.idNumber;
    driver.lastActive = new Date();

    await user.save();
    await driver.save();

    res.status(200).json({ message: 'Profile updated successfully', driver });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch All Drivers
// Fetch All Drivers
router.get('/', async (req, res) => {
  try {
    const drivers = await Driver.find().populate('userId', 'username email');
    res.status(200).json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

// Fetch Available Drivers
router.get('/available', async (req, res) => {
  try {
    const drivers = await Driver.find({ availability: true });
    res.status(200).json(drivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available drivers' });
  }
});

router.get('/:driverId', async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const driver = await Driver.findById(driverId).populate('userId', 'username email');

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ driver });
  } catch (error) {
    console.error('Error fetching driver:', error);
    res.status(500).json({ message: 'Server error while fetching driver', error: error.message });
  }
});


// Fetch Online Drivers
router.get('/online-drivers', async (req, res) => {
  try {
    const onlineDrivers = await Driver.find({ status: 'online', availability: true })
      .populate('userId', 'username email');

    if (!onlineDrivers || onlineDrivers.length === 0) {
      return res.status(404).json({ message: 'No online drivers found' });
    }

    res.status(200).json(onlineDrivers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch online drivers' });
  }
});



// Fetch Driver Status
router.get('/status/:driverId', async (req, res) => {
  try {
    const driverId = req.params.driverId;
    const driver = await Driver.findById(driverId, 'status');
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(200).json({ status: driver.status });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update Driver Status and Location with Authentication and Real-Time Updates
// Update Driver Status and Location with Authentication and Real-Time Updates
router.put('/status/:driverId', ensureAuthenticated, ensureRole(['driver', 'admin']), async (req, res) => {
  try {
    const driverId = req.params.driverId; // Extract driver ID from URL parameters
    const { status, coordinates } = req.body; // Extract status and coordinates from request body

    // Prepare the update data object
    const updateData = { status };

    // Set the driver's location to [0, 0] if status is "busy", "on_trip", or "offline"
    if (['busy', 'on_trip', 'offline'].includes(status)) {
      updateData.currentLocation = {
        type: 'Point',
        coordinates: [0, 0],
      };
    } else if (coordinates && Array.isArray(coordinates) && coordinates.length === 2) {
      // Update coordinates only if valid and the status is not one of the mentioned statuses
      updateData.currentLocation = {
        type: 'Point',
        coordinates,
      };
    }

    // Find the driver by ID and update their status and location
    const driver = await Driver.findByIdAndUpdate(driverId, updateData, { new: true });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Emit a real-time event to notify about the driver's status and location change
    const io = req.app.get('socketio'); // Get the Socket.IO instance from the Express app
    io.emit('driverStatusChange', { 
      driverId: driver._id.toString(), 
      status: driver.status, 
      currentLocation: driver.currentLocation?.coordinates 
    });

    res.status(200).json({ message: 'Driver status and location updated', status: driver.status, currentLocation: driver.currentLocation });
  } catch (error) {
    console.error('Error updating driver status and location:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});






// Delete All Drivers (Admin only)
router.delete('/drivers', ensureAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    await Driver.deleteMany({});
    res.status(200).json({ message: 'All drivers deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Driver Dashboard (for rendering in a view)
router.get('/dashboard', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id }).populate('userId', 'username');
    const trips = await Trip.find({ driver: req.user._id }).populate('rider');
    res.render('driver-dashboard', { driver, trips });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// // Start a Trip
// router.post('/start/:tripId', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
//   try {
//     const trip = await Trip.findById(req.params.tripId);
//     if (!trip) {
//       return res.status(404).json({ message: 'Trip not found' });
//     }
//     trip.status = 'in_progress';
//     await trip.save();

//     const io = req.app.get('socketio');
//     io.to(trip._id.toString()).emit('tripStarted', trip);

//     res.status(200).json({ message: 'Trip started', trip });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// Start a Trip
// Start a Trip Route
router.post('/start/:tripId', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    trip.status = 'in_progress';
    await trip.save();

    const io = req.app.get('socketio');
    if (!io) {
      return res.status(500).json({ error: "Socket.IO instance not found" });
    }

    io.to(trip._id.toString()).emit('tripStarted', trip);

    res.status(200).json({ message: 'Trip started', trip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Calculate and Fetch Distance between Driver and Destination
router.get('/distance/:driverId/:tripId', async (req, res) => {
  try {
    const { driverId, tripId } = req.params;
    const driver = await Driver.findById(driverId);
    const trip = await Trip.findById(tripId);

    if (!driver || !trip) {
      return res.status(404).json({ message: 'Driver or Trip not found' });
    }

    const distance = calculateDistance(driver.currentLocation.coordinates, [trip.origin.latitude, trip.origin.longitude]);
    res.status(200).json({ distance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




module.exports = router;
