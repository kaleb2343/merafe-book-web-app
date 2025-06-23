// netlify/functions/login.js

const admin = require('firebase-admin');

const fetch = require('node-fetch'); // Add node-fetch for making HTTP requests

// Initialize Firebase Admin SDK using environment variables for authentication
// This block ensures the Admin SDK is initialized only once across function invocations.
if (!admin.apps.length) {
    try {
        const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY ?
                                   process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') :
                                   '';

        if (!firebasePrivateKey) {
            console.error('FIREBASE_PRIVATE_KEY environment variable is empty or undefined for login.js.');
            throw new Error('Firebase Private Key is not set or invalid for login function.');
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: firebasePrivateKey,
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for login (auth only, from env vars).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for login:', error);
        console.error('Full Firebase Admin SDK init error object for login:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        throw error;
    }
}

// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        const { email, password } = JSON.parse(event.body);
        const firebaseApiKey = process.env.FIREBASE_API_KEY; // Make sure to set this in Netlify environment variables

        if (!firebaseApiKey) {
            console.error('FIREBASE_API_KEY environment variable is not set.');
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Server configuration error: Missing API key.' }),
            };
        }

        // Step 1: Validate email and password using Firebase REST API
        const firebaseAuthUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`;

        const response = await fetch(firebaseAuthUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: email,
                password: password,
                returnSecureToken: true, // Request a Firebase ID token
            }),
        });

        const responseData = await response.json();

        if (!response.ok) {
            // Firebase auth errors (e.g., INVALID_PASSWORD, EMAIL_NOT_FOUND)
            console.error('Firebase signInWithPassword failed:', responseData.error ? responseData.error.message : 'Unknown error');
            return {
                statusCode: 401, // Unauthorized
                body: JSON.stringify({ message: responseData.error && responseData.error.message ? `Login failed: ${responseData.error.message}` : 'Invalid credentials or user not found.' }),
            };
        }

        // If password is valid, responseData will contain idToken, localId (UID), etc.
        const uid = responseData.localId;

        // Step 2: Get full user record using Admin SDK (optional, if you need more details like displayName not in REST API response)
        // Or, you can trust the UID from the REST API response if that's sufficient.
        let userRecord;
        try {
            userRecord = await admin.auth().getUser(uid);
        } catch (error) {
            console.error('Error fetching user record with Admin SDK after REST API validation:', error);
            // This shouldn't typically happen if the REST API call was successful and returned a valid UID
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error during user data retrieval.' }),
            };
        }

        // Step 3: Create a custom Firebase authentication token for the validated user.
        // This is the token the client will use with signInWithCustomToken.
        const customToken = await admin.auth().createCustomToken(uid);

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*', // Adjust in production
            },
            body: JSON.stringify({
                message: 'Login successful!',
                token: customToken, // This is the custom token for signInWithCustomToken
                userId: uid,
                userDisplayName: userRecord.displayName || responseData.displayName || 'User', // Fallback display name
                // Optionally, you could also return the idToken from responseData if your client needs it for other Firebase services directly
                // firebaseIdToken: responseData.idToken
            }),
        };

    } catch (error) {
        console.error('Netlify function login general error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Internal server error: ${error.message}` }),
        };
    }
};
