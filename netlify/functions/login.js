// netlify/functions/login.js

// Import the Firebase Admin SDK
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if it hasn't been initialized already.
// We need to check if apps are already initialized to prevent errors on hot reloads
// in Netlify Dev, or if the function is called multiple times.
if (!admin.apps.length) {
    try {
        // Firebase Service Account Key details from Netlify Environment Variables
        // IMPORTANT: These environment variables must be set in your Netlify site settings!
        // The PRIVATE_KEY should be a single string with '\n' replacing actual newlines.
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newlines
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            })
        });
        console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error:', error);
        // Log the error but allow the function to proceed, it will likely fail later.
    }
}

const db = admin.firestore(); // Get a reference to the Firestore database service

// Main handler for the Netlify Function
// This function will be triggered by HTTP POST requests to /.netlify/functions/login
exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Parse the request body (it will be JSON from the frontend)
        const { email, password } = JSON.parse(event.body);

        // --- Authentication Logic (Adapted from your server.js) ---

        // SECURITY NOTE: Your original server.js did NOT validate the password securely here.
        // It only checked if a user with the given email exists in Firebase Auth
        // and then generated a custom token for that user.
        // This Netlify Function replicates that (insecure) behavior for migration purposes.
        // For secure password-based login, the client-side Firebase SDK's signInWithEmailAndPassword
        // is typically used, and the server-side verifies the client's ID Token.

        let userRecord;
        try {
            // Attempt to get the user record by email
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // User not found in Firebase Authentication
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'User not found. (Insecure: Password not validated)' }), // Indicating the insecure nature
                };
            }
            // Other authentication errors
            console.error('Error fetching user for login:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error during authentication.' }),
            };
        }

        // If user found, generate a custom token for them
        // This token can then be used by the frontend to sign in with Firebase Auth client-side
        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        // Return a successful response with the token and user info
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'Login successful!',
                token: customToken,
                userId: userRecord.uid,
                userDisplayName: userRecord.displayName || 'User', // Use display name from Firebase Auth
            }),
        };

    } catch (error) {
        console.error('Netlify function login error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error.' }),
        };
    }
};
