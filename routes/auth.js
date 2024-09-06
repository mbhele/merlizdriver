const express = require('express');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Rider = require('../models/Rider');
const PasswordResetToken = require('../models/PasswordResetToken');
const router = express.Router();
const { ensureAuthenticated } = require('../middleware/auth');

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
  logger: true,
  debug: true,
});

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

// Register route
router.post('/register', async (req, res) => {
  const { username, password, email, role, phone, profilePicture } = req.body;

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new user
    const newUser = new User({
      username,
      password: hashedPassword,
      email,
      role: role || 'customer', // Default to customer if no role is provided
      phone,
      profilePicture,
    });
    await newUser.save();

    // If the role is 'rider', create a Rider document
    if (role === 'rider') {
      const newRider = new Rider({
        userId: newUser._id,
        username,
        phone,
        profilePicture,
        paymentMethods: [],
        rideHistory: [],
      });
      await newRider.save();
    }

    const token = generateToken(newUser);

    // Return the user details along with the token
    return res.json({
      message: 'User registered successfully',
      token,
      user: {
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
        profilePicture: newUser.profilePicture,
        availability: newUser.availability,
        status: newUser.status,
        rideHistory: newUser.rideHistory,
        _id: newUser._id,
        paymentMethods: newUser.paymentMethods,
        createdAt: newUser.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login route
router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) {
      console.error('Authentication error:', err);
      return next(err);
    }
    if (!user) {
      return res.status(400).json({ message: info.message });
    }

    const token = generateToken(user);

    // Include the profilePicture and phone in the response
    const userWithProfilePicture = {
      ...user.toObject(),
      profilePicture: user.profilePicture,
      phone: user.phone,
    };

    // Log to verify that profilePicture is included
    console.log('Login user with profilePicture:', userWithProfilePicture);

    res.json({ token, user: userWithProfilePicture });
  })(req, res, next);
});


router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { username, email, phone, profilePicture } = req.body;

    console.log('Updating user with ID:', req.params.id);

    // Update User document
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { username, email, phone, profilePicture },
      { new: true }
    );

    if (!updatedUser) {
      console.log('User not found');
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('Updated User:', updatedUser);

    // Update Rider document
    const updatedRider = await Rider.findOneAndUpdate(
      { userId: req.params.id },
      { username, phone, profilePicture },
      { new: true }
    );

    if (!updatedRider) {
      console.log('Rider not found');
      return res.status(404).json({ message: 'Rider not found' });
    }

    console.log('Updated Rider:', updatedRider);

    res.status(200).json({ 
      message: 'Profile updated successfully', 
      user: {
        ...updatedUser.toObject(),
        riderId: updatedRider._id,
      },
    });
  } catch (error) {
    console.error('Failed to update profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Google OAuth routes
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication, redirect to the appropriate dashboard
    console.log('Google authenticated user:', req.user);
    const userRole = req.user.role || 'customer';
    let redirectUrl = '/';
    if (userRole === 'admin') {
      redirectUrl = '/admin/dashboard';
    } else if (userRole === 'seller') {
      redirectUrl = '/seller/dashboard';
    } else if (userRole === 'customer') {
      redirectUrl = '/customer/dashboard';
    }
    res.redirect(redirectUrl);
  }
);

// Forgot password route
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const resetToken = new PasswordResetToken({
      userId: user._id,
      token,
    });

    await resetToken.save();

    const mailOptions = {
      to: user.email,
      from: process.env.EMAIL,
      subject: 'Password Reset',
      text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
             Please click on the following link, or paste this into your browser to complete the process:\n\n
             http://${req.headers.host}/reset-password/${token}\n\n
             If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Password reset link sent to your email' });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Reset password route
router.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || resetToken.createdAt < new Date(new Date() - 3600 * 1000)) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.render('reset-password', { token });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Handle the reset password form submission
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || resetToken.createdAt < new Date(new Date() - 3600 * 1000)) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    await PasswordResetToken.deleteOne({ token });

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Logout Route
router.post('/logout', (req, res) => {
  if (req.isAuthenticated()) {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: 'Error logging out' });
      }
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    res.json({ message: 'Not authenticated' });
  }
});

module.exports = router;
