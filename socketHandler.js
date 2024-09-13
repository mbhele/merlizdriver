const { Server } = require('socket.io');
const Driver = require('./models/Driver'); // Ensure this path is correct to import the Driver model
const Trip = require('./models/Trip'); // Ensure this path is correct to import the Trip model
const axios = require('axios');
require('dotenv').config(); // Import dotenv for environment variables

const GOOGLE_PLACES_API_KEY = 'AIzaSyAG8YFYpxHJSBvM7bnoWl2tNxDF05Usfow';


function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // Adjust origin as needed
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'], // Ensure both transports are enabled
  });

  // Map to track connected users (driverId, riderId) and their status
  const connectedUsers = new Map(); // { userId: { socketId: string, status: 'online' | 'idle' | 'on_trip' | 'offline' } }

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle driver registration
    socket.on('registerDriver', async ({ driverId }) => {
      if (driverId) {
        connectedUsers.set(driverId, { socketId: socket.id, status: 'online' });
        console.log(`Driver ${driverId} registered/reconnected with socket ID ${socket.id}`);

        socket.join(driverId); // Join a room with the driverId

        // Update driver's status to online in the database
        try {
          await Driver.findByIdAndUpdate(driverId, { status: 'online', availability: true }).exec();
        } catch (error) {
          console.error('Error updating driver status:', error);
        }
      }
    });

    // Handle rider registration
    socket.on('registerRider', ({ riderId }) => {
      if (riderId) {
        connectedUsers.set(riderId, { socketId: socket.id, status: 'online' }); // Set rider as online
        console.log(`Rider ${riderId} registered with socket ID ${socket.id}`);
        socket.join(riderId); // Join a room with the riderId
      }
    });

    // Listen for driver starting a trip
    socket.on('startTrip', async ({ driverId, riderId, currentLocation }) => {
      console.log('Driver started the trip:', { driverId, riderId, currentLocation });

      // Emit the trip start event to the rider
      io.to(riderId).emit('tripStarted', {
        message: 'Driver is coming',
        location: currentLocation, // Send driver's current location
      });

      // Update driver status to 'on_trip'
      if (connectedUsers.has(driverId)) {
        connectedUsers.get(driverId).status = 'on_trip';
        console.log(`Driver ${driverId} is now on a trip.`);
        try {
          await Driver.findByIdAndUpdate(driverId, { status: 'on_trip', availability: false }).exec();
        } catch (error) {
          console.error('Error updating driver status:', error);
        }
      }
    });

    // Handle trip acceptance by driver
    socket.on('acceptTrip', async ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} accepted by driver ${driverId}`);
      
      try {
        const trip = await Trip.findById(tripId);
        if (trip) {
          trip.status = 'accepted';
          trip.driver = driverId;
          await trip.save();

          // Emit trip acceptance event to the rider
          io.to(trip.rider.toString()).emit('tripAccepted', { tripId, driverId, message: 'Your trip has been accepted by a driver.' });
          
          // Update driver status to 'on_trip'
          await Driver.findByIdAndUpdate(driverId, { status: 'on_trip', availability: false }).exec();

          // Start sending notifications for ETA and distance
          sendEtaNotifications(trip, driverId, trip.rider.toString());
        }
      } catch (error) {
        console.error('Error accepting trip:', error);
      }
    });

    // Handle trip rejection by driver
    socket.on('rejectTrip', async ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} rejected by driver ${driverId}`);

      try {
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
        // Emit cancellation event to both the rider and driver involved in the trip
        io.emit('tripCancelled', { tripId, message: 'The trip has been cancelled.' });
        
        // Update trip status to 'cancelled' in the database
        await Trip.findByIdAndUpdate(tripId, { status: 'cancelled' }).exec();
      } catch (error) {
        console.error('Error cancelling trip:', error);
      }
    });

    // Function to send ETA notifications to both driver and rider
    const sendEtaNotifications = async (trip, driverId, riderId) => {
      try {
        const origin = trip.origin; // Assuming origin is the current location of the driver
        const destination = trip.destination; // Assuming destination is the rider's location

        // Fetch ETA and distance data from Google Maps API
        const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
          params: {
            origin: `${origin.latitude},${origin.longitude}`,
            destination: `${destination.latitude},${destination.longitude}`,
            key: GOOGLE_PLACES_API_KEY,  // Here is where the API key is used
          },
        });

        if (response.data.status === 'OK' && response.data.routes.length) {
          const leg = response.data.routes[0].legs[0];
          const eta = leg.duration.text;
          const distance = leg.distance.text;

          // Emit notifications to both driver and rider
          io.to(driverId).emit('driverNotification', { message: `Driver is ${distance} away from the rider with an ETA of ${eta}.` });
          io.to(riderId).emit('riderNotification', { message: `Your driver is ${distance} away with an ETA of ${eta}.` });

          console.log(`Driver is ${distance} away from the rider with an ETA of ${eta}.`);
        }
      } catch (error) {
        console.error('Error fetching ETA and sending notifications:', error);
      }
    };

    // Handle socket disconnection
    socket.on('disconnect', async () => {
      console.log('A user disconnected:', socket.id);
      
      for (let [key, user] of connectedUsers.entries()) {
        if (user.socketId === socket.id) {
          user.status = 'offline'; // Mark as offline
          console.log(`User ${key} marked as offline.`);
          
          // Update driver's status to offline in the database
          await Driver.findByIdAndUpdate(key, { status: 'offline', availability: false }).exec();
          
          connectedUsers.delete(key); // Remove the user from the map
        }
      }
    });

    // Handle additional events like 'joinRoom', 'chatMessage', 'locationUpdate', etc.
    socket.on('joinRoom', ({ roomId }) => {
      socket.join(roomId);
      console.log(`User ${socket.id} joined room ${roomId}`);
    });

    socket.on('chatMessage', ({ roomId, message }) => {
      console.log(`Message in room ${roomId}: ${message}`);
      io.to(roomId).emit('chatMessage', message);
    });

    socket.on('locationUpdate', ({ userId, location }) => {
      console.log(`User ${userId} location updated to`, location);
      io.emit('locationUpdated', { userId, location });
    });
  });

  return io;
}

module.exports = initializeSocket;
