module.exports = function(io) {
    io.on('connection', (socket) => {
      console.log(`New client connected: ${socket.id}`);
  
      // Ensure client joins the room only once per trip
      socket.on('joinTripRoom', ({ tripId }) => {
        console.log(`Client ${socket.id} is joining trip room: ${tripId}`);
        if (socket.rooms.has(tripId)) {
          console.log(`Client ${socket.id} is already in the room: ${tripId}`);
        } else {
          socket.join(tripId); 
          console.log(`Client ${socket.id} successfully joined trip room: ${tripId}`);
        }
      });
  
      // Ensure proper cleanup after trip ends
      socket.on('leaveTripRoom', ({ tripId }) => {
        console.log(`Client ${socket.id} leaving room: ${tripId}`);
        socket.leave(tripId);
      });
  
      // Listen for the join room event for chat rooms
      socket.on('joinChatRoom', ({ roomId }) => {
        console.log(`Client ${socket.id} is joining room: ${roomId}`);
        socket.join(roomId); 
        console.log(`Client ${socket.id} successfully joined room: ${roomId}`);
      });
  
      // Handle real-time driver location updates
      socket.on('driverLocationUpdate', (data) => {
        const { tripId, driverId, location } = data;
        console.log(`Driver ${driverId} sent location update for trip ${tripId}:`, location);
  
        // Broadcast the location to the room associated with the trip (for the rider)
        io.to(tripId).emit('driverLocationUpdate', { tripId, driverId, location });
      });
  
      // Handle chat messages
      socket.on('sendMessage', (data) => {
        const { roomId, message } = data;
        console.log(`Message sent to room ${roomId}: ${message}`);
  
        // Broadcast the message to the specified room
        io.to(roomId).emit('receiveMessage', { roomId, message });
      });
  
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  };
  