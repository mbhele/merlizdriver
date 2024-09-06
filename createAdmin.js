const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.DB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

const createAdminUser = async () => {
  const username = 'admin';
  const password = 'adminpassword';
  const email = 'admin@example.com';

  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = new User({
    username,
    password: hashedPassword,
    email,
    isAdmin: true,
  });

  try {
    await adminUser.save();
    console.log('Admin user created successfully');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

createAdminUser();
