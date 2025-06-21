// netlify/functions/get-books.js

// Import Supabase client and Firebase Admin SDK (for auth only)
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Path to your service account key file for Firebase Admin SDK (for auth verification)
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin SDK if it hasn't been initialized already.
// This is ONLY for verifying user authentication tokens.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: process.env.FIREBASE_PROJECT_ID,
        });
        console.log('Firebase Admin SDK initialized successfully for get-books (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for get-books:', error);
    }
}

// Initialize Supabase client
// This uses the environment variables you set up in Netlify.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

exports.handler = async (event, context) => {
    // Only allow GET requests for fetching books
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Fetch all documents from the 'books' table in Supabase
        // The .select('*') fetches all columns.
        const { data: books, error } = await supabase
            .from('books') // Your table name in Supabase
            .select('*')
            .order('uploadedAt', { ascending: false }); // Order by most recent uploads

        if (error) {
            console.error('Supabase fetch books error:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Failed to fetch books from Supabase.' }),
            };
        }

        // Return the fetched books as a JSON array
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*', // IMPORTANT: Adjust this to your Netlify domain in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: JSON.stringify(books),
        };

    } catch (error) {
        console.error('Netlify function get-books general error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error while fetching books.' }),
        };
    }
};
