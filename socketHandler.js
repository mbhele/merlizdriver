const { Server } = require('socket.io');
const mongoose = require('mongoose'); // Import mongoose to use ObjectId validation
const Driver = require('./models/Driver'); // Ensure this path is correct to import the Driver model
const Trip = require('./models/Trip'); // Ensure this path is correct to import the Trip model
require('dotenv').config(); // Import dotenv for environment variables

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY; // Use environment variable for API key

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // Adjust origin as needed, restrict for production
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'], // Ensure both transports are enabled
  });

  const connectedUsers = new Map(); // Store connected users { userId: { socketId, status } }

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle driver registration
    socket.on('registerDriver', async ({ driverId }) => {
      if (driverId) {
        console.log(`Driver registration attempt: Driver ID = ${driverId}, Socket ID = ${socket.id}`);
        
        connectedUsers.set(driverId, { socketId: socket.id, status: 'online' });
        console.log(`Driver ${driverId} registered/reconnected with socket ID ${socket.id}`);

        socket.join(driverId); // Join a room with the driverId

        // Update driver's status to online in the database
        try {
          if (!mongoose.Types.ObjectId.isValid(driverId)) {
            console.error(`Invalid driver ID: ${driverId}`);
            return;
          }
          await Driver.findByIdAndUpdate(driverId, { status: 'online', availability: true }).exec();
          console.log(`Driver ${driverId} status updated to online`);
        } catch (error) {
          console.error('Error updating driver status:', error);
        }
      } else {
        console.log('Driver registration failed: driverId is missing');
      }
    });

    // Handle rider registration
    socket.on('registerRider', ({ riderId }) => {
      if (riderId) {
        console.log(`Rider registration attempt: Rider ID = ${riderId}, Socket ID = ${socket.id}`);
        
        connectedUsers.set(riderId, { socketId: socket.id, status: 'online' });
        console.log(`Rider ${riderId} registered with socket ID ${socket.id}`);

        socket.join(riderId); // Join a room with the riderId
      } else {
        console.log('Rider registration failed: riderId is missing');
      }
    });

    // Handle driver location updates
    socket.on('locationUpdate', async ({ driverId, location }) => {
      console.log(`Received location update from driver ${driverId}:`, location); // This log should appear on the backend
    
      try {
        if (!mongoose.Types.ObjectId.isValid(driverId)) {
          console.error(`Invalid driver ID: ${driverId}`);
          return;
        }

        const driver = await Driver.findById(driverId);
        if (!driver) {
          console.error(`Driver not found: ${driverId}`);
          return;
        }

        // Check if the driver is on an active trip
        const trip = await Trip.findOne({ driver: driverId, status: 'on_trip' });
        if (!trip) {
          console.error(`No active trip found for driver ${driverId}`);
          return;
        }

        console.log(`Active trip found for driver ${driverId}: Trip ID: ${trip._id}`);

        // Emit the location update to the rider
        io.to(trip.rider.toString()).emit('driverLocationUpdate', {
          location: location,
          tripId: trip._id.toString(),
        });

        console.log(`Location update emitted to rider ${trip.rider} for trip ${trip._id}`);
      } catch (error) {
        console.error('Error handling driver location update:', error);
      }
    });

    // Handle trip acceptance by driver
    socket.on('acceptTrip', async ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} accepted by driver ${driverId}`);
      
      try {
        if (!mongoose.Types.ObjectId.isValid(driverId) || !mongoose.Types.ObjectId.isValid(tripId)) {
          console.error(`Invalid driver ID or trip ID: ${driverId}, ${tripId}`);
          return;
        }

        const trip = await Trip.findById(tripId);
        if (trip) {
          trip.status = 'accepted';
          trip.driver = driverId;
          await trip.save();

          // Emit trip acceptance event to the rider
          io.to(trip.rider.toString()).emit('tripAccepted', { tripId, driverId, message: 'Your trip has been accepted by a driver.' });
          
          // Update driver status to 'on_trip'
          await Driver.findByIdAndUpdate(driverId, { status: 'on_trip', availability: false }).exec();
        } else {
          console.error(`Trip not found: ${tripId}`);
        }
      } catch (error) {
        console.error('Error accepting trip:', error);
      }
    });

    // Handle trip rejection by driver
    socket.on('rejectTrip', async ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} rejected by driver ${driverId}`);

      try {
        if (!mongoose.Types.ObjectId.isValid(tripId)) {
          console.error(`Invalid trip ID: ${tripId}`);
          return;
        }

        const trip = await Trip.findById(tripId); // Fetch the trip first
        if (trip) {
          io.to(trip.rider.toString()).emit('tripRejected', { tripId, driverId, message: 'Your trip has been rejected by the driver.' });
        } else {
          console.error('Trip not found for rejection:', tripId);
        }
      } catch (error) {
        console.error('Error handling trip rejection:', error);
      }
    });

    // Handle trip cancellation by rider or driver
    socket.on('cancelTrip', async ({ tripId, userId }) => {
      console.log(`Trip ${tripId} is being cancelled by user ${userId}`);
      
      try {
        if (!mongoose.Types.ObjectId.isValid(tripId)) {
          console.error(`Invalid trip ID: ${tripId}`);
          return;
        }

        // Emit cancellation event to both the rider and driver involved in the trip
        io.emit('tripCancelled', { tripId, message: 'The trip has been cancelled.' });
        
        // Update trip status to 'cancelled' in the database
        await Trip.findByIdAndUpdate(tripId, { status: 'cancelled' }).exec();
      } catch (error) {
        console.error('Error cancelling trip:', error);
      }
    });

    // Handle socket disconnection
    socket.on('disconnect', async () => {
      console.log('A user disconnected mbus:', socket.id);
      
      for (let [key, user] of connectedUsers.entries()) {
        if (user.socketId === socket.id) {
          user.status = 'offline'; // Mark as offline
          console.log(`User ${key} marked as offline.`);
          
          // Update driver's status to offline in the database
          if (mongoose.Types.ObjectId.isValid(key)) {
            await Driver.findByIdAndUpdate(key, { status: 'offline', availability: false }).exec();
          }
          
          connectedUsers.delete(key); // Remove the user from the map
        }
      }
    });

    // Handle additional events like 'joinRoom', 'chatMessage', etc.
    socket.on('joinRoom', ({ roomId }) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on('chatMessage', ({ roomId, message }) => {
      console.log(`Message in room ${roomId}: ${message}`);
      io.to(roomId).emit('chatMessage', message);
    });
  });

  return io;
}

module.exports = initializeSocket;
