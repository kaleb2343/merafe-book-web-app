// netlify/functions/download-book.js

// Import Supabase client for database interaction and Firebase Admin SDK for authentication.
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK for authentication token verification.
// Ensures it's initialized only once.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for download-book (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for download-book:', error);
    }
}

// Initialize Supabase client for database interaction.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Main handler for the Netlify Function.
exports.handler = async (event, context) => {
    // Handle CORS preflight requests (OPTIONS method).
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: {
                'Access-Control-Allow-Origin': '*', // Adjust in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
                'Access-Control-Max-Age': '86400',
            },
            body: '',
        };
    }

    // Only allow GET requests.
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    // Extract and validate authentication token from headers.
    const authToken = event.headers['x-auth-token'];
    if (!authToken) {
        return {
            statusCode: 401, // Unauthorized
            body: JSON.stringify({ message: 'Authentication token required.' }),
        };
    }

    try {
        // Verify the Firebase Auth token using Firebase Admin SDK.
        await admin.auth().verifyIdToken(authToken);

        // Extract book ID from the request path.
        // Example path: /download-book/BOOK_ID
        const bookId = event.path.split('/').pop();
        // Get preferred filename from query parameters or default to 'download.pdf'.
        const filename = event.queryStringParameters?.filename || 'download.pdf';

        // Validate that a book ID was provided.
        if (!bookId) {
            return {
                statusCode: 400, // Bad Request
                body: JSON.stringify({ message: 'Book ID is required.' }),
            };
        }

        // Fetch book data from Supabase to retrieve the public PDF download URL.
        const { data: bookData, error: fetchError } = await supabase
            .from('books')
            .select('pdfDownloadUrl, pdfPath') // Select only the necessary columns.
            .eq('id', bookId) // Filter by book ID.
            .single(); // Expecting one row for a unique book ID.

        // Handle errors if book data or PDF URL is not found.
        if (fetchError || !bookData || !bookData.pdfDownloadUrl) {
            console.error('Supabase fetch book for download error:', fetchError);
            return {
                statusCode: 404, // Not Found
                body: JSON.stringify({ message: 'PDF file not found for this book.' }),
            };
        }

        // Redirect the client directly to the public Supabase Storage URL for the PDF.
        // This leverages Supabase's built-in file serving.
        const pdfUrl = bookData.pdfDownloadUrl;

        return {
            statusCode: 302, // 302 Found (Temporary Redirect)
            headers: {
                'Location': pdfUrl, // The URL to redirect to.
                // 'Content-Disposition' header suggests the browser to download the file
                // and provides a default filename.
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Access-Control-Allow-Origin': '*', // Adjust in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: '', // No response body needed for a redirect.
        };

    } catch (error) {
        // Handle token expiration or other authentication errors.
        console.error('Netlify function download-book general error:', error);
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return {
                statusCode: 401, // Unauthorized
                body: JSON.stringify({ message: 'Invalid or expired authentication token. Please log in again.' }),
            };
        }
        // Handle any other unexpected errors.
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ message: `Internal server error during download: ${error.message}` }),
        };
    }
};
