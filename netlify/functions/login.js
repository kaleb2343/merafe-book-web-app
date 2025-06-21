// netlify/functions/login.js

const admin = require('firebase-admin');

// Path to your service account key file relative to the function's root
// When deployed, this file will be available alongside your function code.
const serviceAccount = require('../serviceAccountKey.json'); // Adjust path if serviceAccountKey.json is in a different location relative to functions folder

// Initialize Firebase Admin SDK if it hasn't been initialized already.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount), // Use the loaded service account object
            // You can still keep project ID and storage bucket here for clarity,
            // but they are also derived from the serviceAccount object.
            projectId: process.env.FIREBASE_PROJECT_ID, // Still use this env var for consistency/fallback
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET // Still use this env var for consistency/fallback
        });
        console.log('Firebase Admin SDK initialized successfully for login.');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for login:', error);
    }
}

const db = admin.firestore();

exports.handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        const { email, password } = JSON.parse(event.body);

        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'User not found. (Insecure: Password not validated)' }),
                };
            }
            console.error('Error fetching user for login:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error during authentication.' }),
            };
        }

        const customToken = await admin.auth().createCustomToken(userRecord.uid);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: 'Login successful!',
                token: customToken,
                userId: userRecord.uid,
                userDisplayName: userRecord.displayName || 'User',
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
