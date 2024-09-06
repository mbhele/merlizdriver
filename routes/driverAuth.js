const express = require('express');
const passport = require('passport');
const router = express.Router();

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(400).json({ message: info.message });

    if (user.role !== 'driver') return res.status(403).json({ message: 'Unauthorized' });

    req.login(user, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({ message: 'Login successful', redirect: '/driver/dashboard' });
    });
  })(req, res, next);
});

module.exports = router;
