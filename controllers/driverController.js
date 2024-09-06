const Driver = require('../models/Driver'); // Assuming you have a Driver model

exports.getOnlineDrivers = async (req, res) => {
  try {
    const onlineDrivers = await Driver.find({ status: 'online' });
    res.status(200).json(onlineDrivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
