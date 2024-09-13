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

// Cloudinary configuration
cloudinary.config({
  cloud_name: 'duouwjyrc',
  api_key: '853964368612794',
  api_secret: 'Yzx28aI9mTtYJd0BgP14GlPgmw4'
});
const upload = multer();

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' } // Adjust as needed for your application logic
  );
};


router.post('/refresh-token', ensureAuthenticated, (req, res) => {
  try {
    const { id, username, email, role } = req.user; // use the decoded token data
    const newToken = generateToken({ id, username, email, role });
    res.status(200).json({ token: newToken });
  } catch (error) {
    res.status(500).json({ message: 'Failed to refresh token', error: error.message });
  }
});

const calculateDistance = (coord1, coord2) => {
  const toRad = (value) => (value * Math.PI) / 180;
  const lat1 = coord1[0];
  const lon1 = coord1[1];
  const lat2 = coord2[0];
  const lon2 = coord2[1];
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d; // Distance in km
};

// Driver Registration with Image Uploads
router.post('/register', upload.fields([{ name: 'licenseFront', maxCount: 1 }, { name: 'licenseBack', maxCount: 1 }]), async (req, res) => {
  try {
    const { username, email, password, phone, vehicle } = req.body;
    const files = req.files;

    if (!username || !email || !password || !phone || !vehicle || !files.licenseFront || !files.licenseBack) {
      return res.status(400).json({ error: 'All fields, including license images, are required' });
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
      role: 'driver'
    });
    await newUser.save();

    // Upload images to Cloudinary
    const uploadImage = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        streamifier.createReadStream(fileBuffer).pipe(stream);
      });
    };

    const licenseFrontUrl = await uploadImage(files.licenseFront[0].buffer);
    const licenseBackUrl = await uploadImage(files.licenseBack[0].buffer);

    const newDriver = new Driver({
      userId: newUser._id,
      name: username,
      email,
      phone,
      vehicle,
      availability: true,
      driverStatus: 'offline',
      currentLocation: {
        type: 'Point',
        coordinates: [0, 0] // Initial default coordinates
      },
      licenseFront: licenseFrontUrl,
      licenseBack: licenseBackUrl
    });

    await newDriver.save();

    const token = generateToken(newUser);
    res.status(201).json({ message: 'Driver registered successfully', token, driver: newDriver });
  } catch (error) {
    console.error('Error in registration route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Driver Login
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

        const token = generateToken(user);
        console.log('Generated token for driver:', token);

        res.status(200).json({ token, driver });
      });
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }
  })(req, res, next);
});

// Fetch Driver Data
router.get('/me', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user.id }).populate('userId', 'username email');
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    res.status(200).json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Driver Profile
router.put('/me', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const { name, email, phone, vehicle, profilePicture } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    user.username = name || user.username;
    user.email = email || user.email;
    driver.name = name || driver.name;
    driver.email = email || driver.email;
    driver.phone = phone || driver.phone;
    driver.vehicle = vehicle || driver.vehicle;
    if (profilePicture) {
      driver.profilePicture = profilePicture;
    }

    await user.save();
    await driver.save();

    const token = generateToken(user);

    res.status(200).json({ message: 'Profile updated successfully', token, driver });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Update Driver Location
// Update Driver Location
router.put('/location/:id', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const { coordinates } = req.body;
    if (!coordinates || coordinates.length !== 2 || coordinates.includes(null)) {
      return res.status(400).json({ error: 'Invalid coordinates provided' });
    }

    const driver = await Driver.findByIdAndUpdate(req.params.id, {
      currentLocation: { type: 'Point', coordinates }
    }, { new: true });

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Driver Profile Picture Upload
// Driver Profile Picture Upload
// Driver Profile Picture Upload
// Driver Profile Picture Upload
router.post('/upload-profile-picture', ensureAuthenticated, ensureRole(['driver']), upload.single('profilePicture'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      console.error('No file uploaded');
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image' },
      async (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({ error: 'Failed to upload image' });
        }

        console.log('Cloudinary upload success, result:', result); // Debugging log for Cloudinary result

        const imageUrl = result.secure_url;  // Get the secure URL from Cloudinary response
        console.log('Cloudinary URL:', imageUrl);  // Log the Cloudinary URL

        // Find the driver by user ID and update their profile picture with Cloudinary URL
        const driver = await Driver.findOneAndUpdate(
          { userId: req.user._id },  // Find driver by user ID
          { profilePicture: imageUrl },  // Update profilePicture field with Cloudinary URL
          { new: true }  // Return the updated document
        );

        if (!driver) {
          console.error('Driver not found for user ID:', req.user._id);
          return res.status(404).json({ message: 'Driver not found' });
        }

        console.log('Driver profile updated with new image URL:', driver.profilePicture);  // Debugging log

        res.status(200).json({ profilePicture: imageUrl });  // Return the Cloudinary URL
      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);  // Stream the image to Cloudinary
  } catch (error) {
    console.error('Error in upload-profile-picture route:', error);
    res.status(500).json({ error: error.message });
  }
});






// Fetch All Drivers
router.get('/', async (req, res) => {
  try {
    const drivers = await Driver.find().populate('userId', 'username email');
    res.status(200).json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// Start a Trip
router.post('/start/:tripId', ensureAuthenticated, ensureRole(['driver']), async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }
    trip.status = 'in_progress';
    await trip.save();

    const io = req.app.get('socketio');
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

// Start a Trip
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


module.exports = router;
