// netlify/functions/download-book.js

// Import Supabase client and Firebase Admin SDK (for auth only)
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Path to your service account key file for Firebase Admin SDK (for auth verification)
// const serviceAccount = require('../serviceAccountKey.json'); // THIS LINE SHOULD BE GONE OR COMMENTED OUT

// Initialize Firebase Admin SDK if it hasn't been initialized already.
// This is ONLY for verifying user authentication tokens.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({ // THIS PART IS CRUCIAL
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Use environment variable directly
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for download-book (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for download-book:', error);
    }
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ... (rest of your function code)