// server.js - UPDATED: Firebase Storage Integration
// This version uploads and serves book files directly from Firebase Storage.
// - Files are no longer saved locally on the server.
// - Frontend UI and interaction logic remain unchanged.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Still needed for existsSync for initial checks if needed, but not for file writes/reads directly
const cors = require('cors');
const crypto = require('crypto');

// --- Firebase Admin SDK Setup ---
const admin = require('firebase-admin');

// --- MODIFIED SECTION for Firebase Credentials ---
// This block dynamically loads Firebase credentials:
// 1. First, it tries to get the credentials from the GOOGLE_APPLICATION_CREDENTIALS_JSON
//    environment variable (which you set on Render). This is the secure way for production.
// 2. If the environment variable is not set (e.g., during local development),
//    it falls back to trying to load from the local 'serviceAccountKey.json' file.
//    A warning is logged in this case.
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    } catch (e) {
        console.error("Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:", e);
        // It's critical to exit if environment variable is malformed in production
        process.exit(1); 
    }
} else {
    // This 'else' block is primarily for local development.
    // In production (on Render), the GOOGLE_APPLICATION_CREDENTIALS_JSON env var should always be set.
    try {
        serviceAccount = require("./serviceAccountKey.json");
        console.warn("Using local serviceAccountKey.json. Remember to set GOOGLE_APPLICATION_CREDENTIALS_JSON in production environments.");
    } catch (e) {
        console.error("Firebase service account credentials not found. Neither GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable nor local serviceAccountKey.json found. Exiting.");
        // Exit if credentials are not found in either place
        process.exit(1); 
    }
}
// --- END OF MODIFIED SECTION ---

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
    // databaseURL is often included here for Realtime Database.
    // If you are only using Firestore, it might not be strictly necessary,
    // or you can set it to your project's URL like:
    // databaseURL: "https://my-merafe-books.firebaseio.com"
});

const db = admin.firestore(); // Firestore instance
// Note: Ensure your Firebase Storage rules are configured to allow public read/write
// or authenticated access as per your app's requirements.
const bucket = admin.storage().bucket(); // Get a reference to the Firebase Storage bucket

// --- Express App Setup ---
const app = express();
// PORT is now correctly set to use Render's environment variable or fallback to 3000 for local development.
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS
app.use(express.static('public')); // Serve static files

// --- Multer Configuration (for in-memory storage) ---
// Files are temporarily stored in memory before uploading to Firebase Storage.
const upload = multer({ storage: multer.memoryStorage() }).fields([
    { name: 'coverImageFile', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- In-memory Session Management (unchanged) ---
const activeSessions = new Map(); // sessionId -> userId

// --- Authentication Middleware (unchanged) ---
const isAuthenticated = async (req, res, next) => {
    const authToken = req.headers['x-auth-token'];

    if (!authToken) {
        return res.status(401).json({ message: 'Unauthorized: No authentication token provided.' });
    }

    const userId = activeSessions.get(authToken);

    if (!userId) {
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
    }

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            activeSessions.delete(authToken);
            return res.status(401).json({ message: 'Unauthorized: User associated with token not found.' });
        }
        req.user = { id: userId, ...userDoc.data() };
        next();
    } catch (error) {
        console.error('Error verifying user token with Firestore:', error);
        res.status(500).json({ message: 'Internal server error during authentication.' });
    }
};

// --- Authentication Routes (unchanged) ---
app.post('/api/signup', async (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
        return res.status(400).json({ message: 'All fields are required for signup.' });
    }
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        if (!snapshot.empty) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }
        const newUserRef = await usersRef.add({
            email,
            password,
            displayName,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('New user signed up in Firestore with ID:', newUserRef.id);
        res.status(201).json({ message: 'Signup successful! Please log in.' });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Internal server error during signup.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required for login.' });
    }
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        if (snapshot.empty) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        if (userData.password !== password) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }
        const sessionToken = crypto.randomUUID();
        activeSessions.set(sessionToken, userDoc.id);
        console.log('User logged in from Firestore:', userData.email, 'Session Token:', sessionToken);
        res.status(200).json({
            message: 'Login successful!',
            userId: userDoc.id,
            displayName: userData.displayName,
            authToken: sessionToken
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// --- Helper function to upload file to Firebase Storage ---
async function uploadFileToFirebaseStorage(file, destinationFolder) {
    const filename = `${destinationFolder}/${Date.now()}-${file.originalname}`;
    const fileUpload = bucket.file(filename);
    const blobStream = fileUpload.createWriteStream({
        metadata: {
            contentType: file.mimetype
        }
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (error) => {
            console.error('Error uploading to Firebase Storage:', error);
            reject('Upload failed.');
        });

        blobStream.on('finish', async () => {
            // Make the file publicly accessible
            await fileUpload.makePublic();
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`;
            resolve(publicUrl);
        });

        blobStream.end(file.buffer);
    });
}

// --- Book Upload Endpoint: Saves book details to Firestore & files to Storage ---
app.post('/upload-book', isAuthenticated, (req, res) => {
    upload(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error during upload:', err);
            return res.status(500).json({ message: `Multer error: ${err.message}` });
        } else if (err) {
            console.error('An unknown error occurred during upload:', err);
            return res.status(500).json({ message: `An unknown error occurred: ${err.message}` });
        }

        const { bookName, authorName, genre, bookDescription } = req.body;
        const coverImageFile = req.files && req.files['coverImageFile'] ? req.files['coverImageFile'][0] : null;
        const pdfFile = req.files && req.files['pdfFile'] ? req.files['pdfFile'][0] : null;

        if (!bookName || !authorName || !genre || !bookDescription) {
            return res.status(400).json({ message: 'Book name, author, genre, and description are required.' });
        }

        let coverImageUrl = null;
        let pdfDownloadUrl = null;

        try {
            // --- Duplicate Book Check against Firestore ---
            const existingBooksQuery = await db.collection('books')
                .where('bookName', '==', bookName)
                .where('authorName', '==', authorName)
                .limit(1)
                .get();

            if (!existingBooksQuery.empty) {
                return res.status(409).json({ message: 'A book with this name and author already exists.' });
            }

            // Upload files to Firebase Storage
            if (coverImageFile) {
                coverImageUrl = await uploadFileToFirebaseStorage(coverImageFile, 'covers');
            }
            if (pdfFile) {
                pdfDownloadUrl = await uploadFileToFirebaseStorage(pdfFile, 'pdfs');
            }

            // Prepare new book data to be saved in Firestore
            const newBookData = {
                bookName,
                authorName,
                genre,
                bookDescription,
                coverImageUrl: coverImageUrl, // Store Firebase Storage public URL
                pdfDownloadUrl: pdfDownloadUrl, // Store Firebase Storage public URL
                uploadedByUserId: req.user.id,
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('books').add(newBookData);
            console.log('New book added to Firestore with ID:', docRef.id);

            res.status(200).json({
                message: 'Book uploaded successfully!',
                book: { id: docRef.id, ...newBookData }
            });
        } catch (error) {
            console.error('Error during book upload to storage or Firestore:', error);
            res.status(500).json({ message: 'Failed to upload book data or files.' });
        }
    });
});

// --- Get All Books Endpoint: Fetches books from Firestore ---
app.get('/api/books', async (req, res) => {
    try {
        let booksQuery = db.collection('books');
        const snapshot = await booksQuery.orderBy('uploadedAt', 'desc').get();
        const books = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            books.push({
                id: doc.id,
                bookName: data.bookName,
                authorName: data.authorName,
                genre: data.genre,
                bookDescription: data.bookDescription,
                coverImageUrl: data.coverImageUrl, // Now directly the public URL from Firestore
                pdfDownloadUrl: data.pdfDownloadUrl, // Now directly the public URL from Firestore
                uploadedByUserId: data.uploadedByUserId
            });
        });
        console.log('Fetched ALL books from Firestore for public view. Number of books:', books.length);
        res.status(200).json(books);
    } catch (error) {
        console.error('Error fetching books from Firestore:', error);
        res.status(500).json({ message: 'Failed to fetch book data from database.' });
    }
});

// --- Book Download Endpoint: Redirects to Firebase Storage URL ---
// Frontend will now directly use the pdfDownloadUrl provided by /api/books
// This endpoint might become redundant if all PDFs are public, but we keep it
// for consistency and potential future signed URL use if files become private.
app.get('/download-book/:bookId', isAuthenticated, async (req, res) => {
    const bookId = req.params.bookId;

    try {
        const bookDoc = await db.collection('books').doc(bookId).get();
        if (!bookDoc.exists) {
            return res.status(404).json({ message: 'Book not found.' });
        }

        const book = bookDoc.data();
        const pdfUrl = book.pdfDownloadUrl; // Get the Firebase Storage public URL

        if (pdfUrl) {
            // Redirect the client to the public URL of the PDF in Firebase Storage
            res.redirect(pdfUrl);
        } else {
            res.status(404).json({ message: 'PDF file not found for this book.' });
        }
    } catch (error) {
        console.error('Error fetching book for download from Firestore:', error);
        res.status(500).json({ message: 'Internal server error during download.' });
    }
});

// --- DELETE Book Endpoint ---
app.delete('/api/books/:bookId', isAuthenticated, async (req, res) => {
    const bookId = req.params.bookId;
    const userId = req.user.id; // User ID from authenticated token

    try {
        const bookRef = db.collection('books').doc(bookId);
        const bookDoc = await bookRef.get();

        if (!bookDoc.exists) {
            return res.status(404).json({ message: 'Book not found.' });
        }

        const bookData = bookDoc.data();

        // Ensure only the uploader can delete their own book
        if (bookData.uploadedByUserId !== userId) {
            return res.status(403).json({ message: 'Forbidden: You can only delete your own books.' });
        }

        // Delete the associated files from Firebase Storage
        if (bookData.coverImageUrl) {
            const coverFileName = bookData.coverImageUrl.split('/').pop(); // Get filename from URL
            const coverFileRef = bucket.file(`covers/${coverFileName}`); // Construct storage path
            await coverFileRef.delete().catch(err => console.warn('Warning: Could not delete cover image from storage:', err.message)); // Log warning if delete fails
        }
        if (bookData.pdfDownloadUrl) {
            const pdfFileName = bookData.pdfDownloadUrl.split('/').pop(); // Get filename from URL
            const pdfFileRef = bucket.file(`pdfs/${pdfFileName}`); // Construct storage path
            await pdfFileRef.delete().catch(err => console.warn('Warning: Could not delete PDF from storage:', err.message)); // Log warning if delete fails
        }

        // Delete the book document from Firestore
        await bookRef.delete();
        console.log('Book deleted from Firestore:', bookId);

        res.status(200).json({ message: 'Book deleted successfully!' });
    } catch (error) {
        console.error('Error deleting book from Firestore or Storage:', error);
        res.status(500).json({ message: 'Internal server error during book deletion.' });
    }
});


// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Firebase Storage integrated. Files will be stored in Google Cloud Storage.');
    console.log('***IMPORTANT: Ensure your "serviceAccountKey.json" is correct and Firebase Storage rules allow access.***');
});
