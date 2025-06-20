// netlify/functions/download-book.js

const admin = require('firebase-admin');
// Needed for stream functionality if using response.pipe()
const { getStorage } = require('firebase-admin/storage'); 

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            }),
            // Initialize Firebase Storage bucket for your project
            // Replace 'your-project-id.appspot.com' with your actual storage bucket URL
            // You can find this in your Firebase Console -> Storage -> Files tab
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET // e.g., "my-merafe-books.appspot.com"
        });
        console.log('Firebase Admin SDK initialized for download-book.');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for download-book:', error);
    }
}

const db = admin.firestore();
const bucket = getStorage().bucket(); // Get the default storage bucket

exports.handler = async (event, context) => {
    // Enable CORS for preflight OPTIONS requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No content for preflight
            headers: {
                'Access-Control-Allow-Origin': '*', // IMPORTANT: Restrict this to your Netlify domain in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
                'Access-Control-Max-Age': '86400', // Cache preflight response for 24 hours
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
        // Verify the auth token. This ensures only logged-in users can download.
        // If your original server.js didn't do this, you might remove it, but it's good practice.
        await admin.auth().verifyIdToken(authToken); // This will throw an error if the token is invalid

        // Extract book ID from the path (e.g., /download-book/BOOK_ID)
        const bookId = event.path.split('/').pop(); // Gets the last segment of the path

        // Get filename from query parameters, if available. For the frontend to suggest a filename.
        const filename = event.queryStringParameters?.filename || 'download.pdf';

        if (!bookId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Book ID is required.' }),
            };
        }

        // Fetch book data from Firestore to get the PDF path
        const bookDoc = await db.collection('books').doc(bookId).get();

        if (!bookDoc.exists) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'Book not found.' }),
            };
        }

        const bookData = bookDoc.data();
        const pdfStoragePath = bookData.pdfPath; // This path should be the Firebase Storage path, e.g., 'pdfs/book123.pdf'

        if (!pdfStoragePath) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'PDF file not found for this book in Storage.' }),
            };
        }

        // Generate a signed URL for the file in Firebase Storage
        // This URL allows direct download by the client without passing through the function.
        const [url] = await bucket.file(pdfStoragePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000, // URL valid for 15 minutes
        });

        // Redirect the client to the signed URL to initiate download.
        // Netlify Functions support redirects.
        return {
            statusCode: 302, // 302 Found or 307 Temporary Redirect
            headers: {
                'Location': url,
                'Content-Disposition': `attachment; filename="${filename}"`, // Suggests download name
                'Access-Control-Allow-Origin': '*', // IMPORTANT: Adjust this to your Netlify domain in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: '', // Body is not needed for a redirect
        };

    } catch (error) {
        console.error('Netlify function download-book error:', error);
        // If token verification fails, it will be caught here
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Invalid or expired authentication token. Please log in again.' }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error during download.' }),
        };
    }
};
