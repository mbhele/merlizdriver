

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:/Users/mbhele/Desktop/pol/backend/credentials/firebase-adminsdk.json";

const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin SDK
const serviceAccount = require('../credentials/firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

async function sendPushNotification(expoPushToken, message) {
    const fetch = (await import('node-fetch')).default;
  
    const payload = {
      message: {
        token: expoPushToken,  // Expo token goes here
        notification: {
          title: message.title,
          body: message.body,
        },
        data: message.data,
      },
    };
  
    try {
      const response = await fetch('https://fcm.googleapis.com/v1/projects/merliz-b5454/messages:send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await getAccessToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
  
      const responseData = await response.json();
      if (responseData.error) {
        console.error('Error sending push notification:', responseData.error);
      } else {
        console.log('Push notification sent successfully:', responseData);
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
  
// Function to get the OAuth2 access token for HTTP v1 API
async function getAccessToken() {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
}

module.exports = { sendPushNotification };
