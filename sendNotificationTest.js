const { sendPushNotification } = require('./utils/notifications');

// Replace this with the actual device token from your app
const expoPushToken = 'ExponentPushToken[qxRZElPrI2y2AjWnqLtn6O]';

const message = {
  title: 'Hello, MBUSO!',
  body: 'This is a test notification via Firebase Admin.',
  data: { extraData: 'Some extra data related to MBUSO' },
};

// Send the push notification
sendPushNotification(expoPushToken, message);
