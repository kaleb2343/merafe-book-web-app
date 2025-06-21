    // netlify/functions/login.js

    const admin = require('firebase-admin');

    // Initialize Firebase Admin SDK using environment variables
    // This is for Firebase Authentication ONLY.
    if (!admin.apps.length) {
        try {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newlines are correctly interpreted
                }),
            });
            console.log('Firebase Admin SDK initialized successfully for login (auth only, from env vars).');
        } catch (error) {
            console.error('Firebase Admin SDK initialization error for login:', error);
        }
    }

    exports.handler = async (event, context) => {
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
    
