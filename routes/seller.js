const express = require('express');
const router = express.Router();
const passport = require('passport');
const { ensureAuthenticated, ensureRole } = require('../middleware/auth');

// Seller Login (public route)
router.get('/seller-login', (req, res) => {
  res.render('seller-login', { message: req.flash('error') });
});

// Seller Login POST handler
router.post('/login', passport.authenticate('local', {
  successRedirect: '/seller/dashboard',
  failureRedirect: '/seller/seller-login',
  failureFlash: true
}));

// Seller Dashboard (protected route)
router.get('/dashboard', ensureAuthenticated, ensureRole('seller'), async (req, res) => {
  try {
    const user = req.user; // Get the authenticated user from the request
    res.render('seller-dashboard', { user });
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
    res.redirect('/seller/seller-login');
  });
});

module.exports = router;
