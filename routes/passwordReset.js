// routes/passwordReset.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const PasswordResetToken = require('../models/PasswordResetToken');
const path = require('path');

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

// Forgot password route
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render('request-reset', { message: 'User not found', messageType: 'error' });
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
             http://${req.headers.host}/reset/${token}\n\n
             If you did not request this, please ignore this email and your password will remain unchanged.\n`,
    };

    await transporter.sendMail(mailOptions);
    res.render('request-reset', { message: 'Password reset link sent to your email', messageType: 'success' });
  } catch (err) {
    res.render('request-reset', { message: 'Internal server error', messageType: 'error' });
  }
});

// Reset password route
router.get('/reset/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || resetToken.createdAt < new Date(new Date() - 3600 * 1000)) {
      return res.render('reset-password', { token, message: 'Invalid or expired token', messageType: 'error', redirectUrl: null });
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.render('reset-password', { token, message: 'User not found', messageType: 'error', redirectUrl: null });
    }

    res.render('reset-password', { token, message: null, messageType: null, redirectUrl: null });
  } catch (err) {
    res.render('reset-password', { token, message: 'Internal server error', messageType: 'error', redirectUrl: null });
  }
});

// Handle the reset password form submission
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const resetToken = await PasswordResetToken.findOne({ token });
    if (!resetToken || resetToken.createdAt < new Date(new Date() - 3600 * 1000)) {
      return res.render('reset-password', { token, message: 'Invalid or expired token', messageType: 'error', redirectUrl: null });
    }

    const user = await User.findById(resetToken.userId);
    if (!user) {
      return res.render('reset-password', { token, message: 'User not found', messageType: 'error', redirectUrl: null });
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    await PasswordResetToken.deleteOne({ token });

    // Determine the appropriate login URL based on user role
    let loginUrl = '/login';
    if (user.role === 'admin') {
      loginUrl = '/admin/admin-login';
    } else if (user.role === 'seller') {
      loginUrl = '/seller/seller-login';
    } else if (user.role === 'customer') {
      loginUrl = '/customer/customer-login';
    }

    res.render('reset-password', { token, message: 'Password has been reset successfully. You will be redirected to login shortly...', messageType: 'success', redirectUrl: loginUrl });

  } catch (err) {
    res.render('reset-password', { token, message: 'Internal server error', messageType: 'error', redirectUrl: null });
  }
});

module.exports = router;
