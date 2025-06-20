// netlify/functions/get-books.js

// Import the Firebase Admin SDK
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if it hasn't been initialized already.
// This is important for Netlify Functions, which can be 'cold-started' or 'warm'.
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newlines are correctly parsed
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            })
        });
        console.log('Firebase Admin SDK initialized successfully for get-books.');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for get-books:', error);
        // If initialization fails, subsequent Firestore operations will also fail.
        // The function will return a 500 error in the handler.
    }
}

const db = admin.firestore(); // Get a reference to the Firestore database service

// Main handler for the Netlify Function
// This function will be triggered by HTTP GET requests to /.netlify/functions/get-books
exports.handler = async (event, context) => {
    // Only allow GET requests for fetching books
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // Fetch all documents from the 'books' collection
        // IMPORTANT: Assuming your books collection is directly under the root.
        // If your Firestore structure is different (e.g., nested under users),
        // this path will need adjustment.
        const booksRef = db.collection('books'); // Reference to the 'books' collection
        const snapshot = await booksRef.get(); // Get all documents in the collection

        const books = [];
        snapshot.forEach(doc => {
            // For each document, get its data and ID
            const bookData = doc.data();
            books.push({
                id: doc.id, // Add the Firestore document ID to the book object
                ...bookData,
                // Ensure imageUrls and pdfDownloadUrls are correctly formatted for frontend display
                // (e.g., if you store paths, convert them to full URLs if needed)
            });
        });

        // Return the fetched books as a JSON array
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                // Add CORS headers for cross-origin requests from your frontend
                'Access-Control-Allow-Origin': '*', // IMPORTANT: Adjust this to your Netlify domain in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: JSON.stringify(books),
        };

    } catch (error) {
        console.error('Netlify function get-books error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to fetch books.' }),
        };
    }
};
