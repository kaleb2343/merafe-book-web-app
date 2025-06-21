// netlify/functions/download-book.js

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
        console.log('Firebase Admin SDK initialized successfully for download-book (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for download-book:', error);
    }
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

exports.handler = async (event, context) => {
    // Enable CORS for preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
                'Access-Control-Max-Age': '86400',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    const authToken = event.headers['x-auth-token'];
    if (!authToken) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Authentication token required.' }),
        };
    }

    try {
        // Verify the user's Firebase Auth token
        await admin.auth().verifyIdToken(authToken);

        // Extract book ID from the path (e.g., /download-book/BOOK_ID)
        const bookId = event.path.split('/').pop();
        const filename = event.queryStringParameters?.filename || 'download.pdf';

        if (!bookId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Book ID is required.' }),
            };
        }

        // Fetch book data from Supabase to get the PDF download URL
        const { data: bookData, error: fetchError } = await supabase
            .from('books')
            .select('pdfDownloadUrl, pdfPath') // Select only the necessary columns
            .eq('id', bookId)
            .single(); // Expecting one row

        if (fetchError || !bookData || !bookData.pdfDownloadUrl) {
            console.error('Supabase fetch book for download error:', fetchError);
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'PDF file not found for this book.' }),
            };
        }

        // The public URL is already stored in pdfDownloadUrl from upload-book.js
        // We can just redirect the client to this public URL.
        const pdfUrl = bookData.pdfDownloadUrl;

        return {
            statusCode: 302, // 302 Found or 307 Temporary Redirect
            headers: {
                'Location': pdfUrl, // Redirect to the public Supabase Storage URL
                'Content-Disposition': `attachment; filename="${filename}"`, // Suggests download name
                'Access-Control-Allow-Origin': '*', // IMPORTANT: Adjust this to your Netlify domain in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: '', // Body is not needed for a redirect
        };

    } catch (error) {
        console.error('Netlify function download-book general error:', error);
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid or expired authentication token. Please log in again.' }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Internal server error during download: ${error.message}` }),
        };
    }
};
