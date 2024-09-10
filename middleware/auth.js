const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const ensureAuthenticated = (req, res, next) => {
  const authHeader = req.header('Authorization'); // Retrieve the Authorization header

  if (!authHeader) {
    console.error('Authorization header missing'); // Log error for debugging
    return res.status(401).json({ message: 'Authorization header missing' });
  }

  console.log('Authorization Header:', authHeader); // Debug log

  // Extract token from "Bearer <token>"
  const token = authHeader.split(' ')[1];

  if (!token) {
    console.error('No token provided'); // Log error for debugging
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Verify the token
    console.log('Decoded JWT:', decoded); // Log the decoded token for debugging
    req.user = decoded; // Attach decoded user info to req object
    req.isAuthenticated = true; // Set isAuthenticated to true
    next(); // Proceed to the next middleware
  } catch (err) {
    console.error('Token verification error:', err); // Log error for debugging
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const ensureRole = (roles) => {
  return (req, res, next) => {
    if (req.isAuthenticated && roles.includes(req.user.role)) {
      return next();
    }
    res.status(403).json({ message: `Access denied. ${roles.join(', ')} only.` });
  };
};

module.exports = { ensureAuthenticated, ensureRole };
