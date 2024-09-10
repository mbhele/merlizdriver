const { Server } = require('socket.io');
const Driver = require('./models/Driver'); // Ensure this path is correct to import the Driver model
const Trip = require('./models/Trip'); // Ensure this path is correct to import the Trip model

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: 'http://192.168.43.59:5000', // Update this to match your client URL
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket'], // Use only WebSocket for stability
  });

  // Map to track connected users (driverId, riderId) and their status
  const connectedUsers = new Map(); // { userId: { socketId: string, status: 'online' | 'idle' | 'on_trip' | 'offline' } }

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Handle driver registration
    socket.on('registerDriver', ({ driverId }) => {
      if (driverId) {
        connectedUsers.set(driverId, { socketId: socket.id, status: 'online' }); // Set driver as online
        console.log(`Driver ${driverId} registered with socket ID ${socket.id}`);
        socket.join(driverId); // Join a room with the driverId

        // Update driver's status to online in the database
        Driver.findByIdAndUpdate(driverId, { status: 'online', availability: true }).exec();
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

    // Listen for status updates (e.g., 'idle', 'on_trip', 'offline')
    socket.on('updateStatus', ({ userId, status }) => {
      if (connectedUsers.has(userId)) {
        const user = connectedUsers.get(userId);
        user.status = status; // Update the user's status
        connectedUsers.set(userId, user);
        console.log(`User ${userId} status updated to ${status}`);

        // Update the driver's status in the database
        Driver.findByIdAndUpdate(userId, { status }).exec();
      }
    });

    // Emit trip request only to 'online' or 'idle' drivers
    socket.on('newTripRequest', (trip) => {
      connectedUsers.forEach((user, driverId) => {
        if (user.status === 'online' || user.status === 'idle') { // Check driver status
          console.log(`Emitting 'newTrip' to driver ${driverId} with status ${user.status}`);
          io.to(user.socketId).emit('newTrip', trip); // Emit to drivers who are online or idle
        }
      });
    });

    // Handle trip acceptance by driver
    socket.on('acceptTrip', async ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} accepted by driver ${driverId}`);
      
      const trip = await Trip.findById(tripId);
      if (trip) {
        trip.status = 'accepted';
        trip.driver = driverId;
        await trip.save();

        // Emit trip acceptance event to the rider
        io.to(trip.rider.toString()).emit('tripAccepted', { tripId, driverId, message: 'Your trip has been accepted by a driver.' });
        
        // Update driver status to 'on_trip'
        Driver.findByIdAndUpdate(driverId, { status: 'on_trip', availability: false }).exec();
      }
    });

    // Handle trip rejection by driver
    socket.on('rejectTrip', ({ tripId, driverId }) => {
      console.log(`Trip ${tripId} rejected by driver ${driverId}`);
      
      // Emit trip rejection event to the rider
      io.emit('tripRejected', { tripId, driverId, message: 'Your trip has been rejected by the driver.' });
    });

    // Handle trip cancellation by rider or driver
    socket.on('cancelTrip', ({ tripId, userId }) => {
      console.log(`Trip ${tripId} is being cancelled by user ${userId}`);
      
      // Emit cancellation event to both the rider and driver involved in the trip
      io.emit('tripCancelled', { tripId, message: 'The trip has been cancelled.' });
      
      // Update trip status to 'cancelled' in the database
      Trip.findByIdAndUpdate(tripId, { status: 'cancelled' }).exec();
    });

    // Handle socket disconnection
    socket.on('disconnect', () => {
      console.log('A user disconnected:', socket.id);
      
      // Update the driver's status to offline in the database
      connectedUsers.forEach((user, key) => {
        if (user.socketId === socket.id) {
          user.status = 'offline'; // Mark as offline
          console.log(`User ${key} marked as offline.`);
          
          // Update driver's status to offline in the database
          Driver.findByIdAndUpdate(key, { status: 'offline', availability: false }).exec();
          
          connectedUsers.delete(key); // Remove the user from the map
        }
      });
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
      // Update location in your application logic or emit an event
      io.emit('locationUpdated', { userId, location });
    });
  });

  return io;
}

module.exports = initializeSocket;
