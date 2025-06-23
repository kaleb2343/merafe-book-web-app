// netlify/functions/login.js

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK using environment variables for authentication
// This block ensures the Admin SDK is initialized only once across function invocations.
// Initialize Firebase Admin SDK for authentication token verification.
// Ensures it's initialized only once per function instance lifecycle.
if (!admin.apps.length) {
    try {
        // Ensure the private key is correctly parsed by replacing escaped newlines.
        const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY ?
                                   process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') :
                                   ''; // Default to empty string if undefined

        if (!firebasePrivateKey) {
            console.error('FIREBASE_PRIVATE_KEY environment variable is empty or undefined for login.js.');
            throw new Error('Firebase Private Key is not set or invalid for login function.'); // Throw to catch in outer block
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: firebasePrivateKey, // Use the processed variable
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for login (auth only, from env vars).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for login:', error);
        console.error('Full Firebase Admin SDK init error object for login:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw error; // Re-throw to propagate the initialization error
    }
}

// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    // Only allow POST requests for this function.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Parse the request body to get email and password.
        const { email, password } = JSON.parse(event.body);

        let userRecord;
        try {
            // Attempt to retrieve user by email from Firebase Authentication.
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (error) {
            // If user is not found, return a 404.
            // Note: In a real-world scenario, you might want to be less specific for security.
            if (error.code === 'auth/user-not-found') {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'User not found. (Note: Password not validated by this function.)' }),
                };
            }
            // Log other authentication-related errors.
            console.error('Error fetching user for login:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error during user lookup.' }),
            };
        }

        // Create a custom Firebase authentication token for the found user.
        // This token will be sent to the client to sign in to Firebase client-side.
        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        // Return a successful response with the custom token and user details.
        return {
            statusCode: 200, // OK
            headers: {
                "Content-Type": "application/json",
                // CORS header to allow requests from any origin.
                // In production, consider restricting this to your specific Netlify domain.
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: 'Login successful!',
                token: customToken,
                userId: userRecord.uid,
                userDisplayName: userRecord.displayName || 'User', // Fallback display name
            }),
        };

    } catch (error) {
        // Catch any unexpected errors during the function execution.
        console.error('Netlify function login general error:', error);
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ message: `Internal server error: ${error.message}` }),
        };
    }
};
