// netlify/functions/get-books.js

// Import Supabase client for database interaction and Firebase Admin SDK for authentication.
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for authentication token verification.
// This ensures initialization happens only once per function instance lifecycle.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for get-books (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for get-books:', error);
    }
}

// Initialize Supabase client using environment variables for URL and API key.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Main handler for the Netlify Function.
exports.handler = async (event, context) => {
    // Only allow GET requests.
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Fetch all documents from the 'books' table in Supabase.
        // '.select('*')' retrieves all columns.
        // '.order('uploadedAt', { ascending: false })' sorts results by upload time, newest first.
        const { data: books, error } = await supabase
            .from('books') // The name of your table in Supabase
            .select('*')
            .order('uploadedAt', { ascending: false });

        // Handle any errors from Supabase during the fetch operation.
        if (error) {
            console.error('Supabase fetch books error:', error);
            return {
                statusCode: 500, // Internal Server Error
                body: JSON.stringify({ message: 'Failed to fetch books from Supabase.' }),
            };
        }

        // Return the fetched books as a JSON array.
        return {
            statusCode: 200, // OK
            headers: {
                "Content-Type": "application/json",
                // CORS headers to allow requests from your frontend.
                // IMPORTANT: In production, change '*' to your actual Netlify domain (e.g., 'https://your-site.netlify.app').
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: JSON.stringify(books),
        };

    } catch (error) {
        // Catch any unexpected general errors during the function execution.
        console.error('Netlify function get-books general error:', error);
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ message: `Internal server error while fetching books: ${error.message}` }),
        };
    }
};
