const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

module.exports = function(passport) {
  // Local Strategy
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`Attempting login for username: ${username}`);
  
        const user = await User.findOne({ username });
        console.log('User found:', user);
  
        if (!user) {
          console.log('User not found');
          return done(null, false, { message: 'User not found' });
        }
  
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password match:', isMatch);
  
        if (!isMatch) {
          console.log('Incorrect password');
          return done(null, false, { message: 'Incorrect password' });
        }
  
        return done(null, user);
      } catch (err) {
        console.error('Error during login:', err);
        return done(err);
      }
    })
  );
  

  // Google Strategy
  passport.use(
    new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:5000/auth/google/callback"
    },
    async (token, tokenSecret, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = new User({
            googleId: profile.id,
            username: profile.displayName,
            email: profile.emails[0].value,
            role: 'customer'
          });
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
