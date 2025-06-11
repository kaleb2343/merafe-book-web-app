// server.js - FINAL PRODUCTION VERSION (v2): Firebase Storage & Environment Variable Integration
// This version securely loads Firebase credentials from an environment variable,
// uses Firebase Storage for file uploads (covers & PDFs), and explicitly
// configures the storage bucket name.

const express = require('express');
const multer = require('multer');
const path = require('path'); // Still useful for path.basename but not for local storage
const fs = require('fs'); // Still useful for existsSync (for local dev fallback check) but not for file writes/reads directly
const cors = require('cors');
const crypto = require('crypto');

// --- Firebase Admin SDK Setup ---
const admin = require('firebase-admin');

// --- CRITICAL: Firebase Credentials from Environment Variable ---
// This block loads Firebase credentials:
// 1. Attempts to load from the GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable (for Render/production).
// 2. Falls back to local 'serviceAccountKey.json' for local development (if env var not set).
let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    } catch (e) {
        console.error("CRITICAL ERROR: Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable. Ensure it's valid JSON.");
        process.exit(1); // Exit process if environment variable is malformed
    }
} else {
    try {
        serviceAccount = require("./serviceAccountKey.json");
        console.warn("WARNING: Using local serviceAccountKey.json. For production, set GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable.");
    } catch (e) {
        console.error("CRITICAL ERROR: Firebase service account credentials not found. Neither GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable nor local serviceAccountKey.json found. Exiting.");
        process.exit(1); // Exit process if no credentials are found
    }
}
// --- END CRITICAL SECTION ---

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // IMPORTANT: Specify your Firebase Storage bucket name here.
    // It's typically your Project ID followed by '.appspot.com'.
    storageBucket: 'my-merafe-books.appspot.com' // <--- THIS LINE IS THE KEY NEW ADDITION!
    // If you use Firebase Realtime Database, ensure you set databaseURL here.
    // E.g., databaseURL: "https://my-merafe-books.firebaseio.com"
});

const db = admin.firestore(); // Get a reference to the Firestore database service
// Ensure your Firebase Storage bucket is correctly named (usually your project ID).
// And ensure your Storage Security Rules allow appropriate read/write access.
const bucket = admin.storage().bucket(); // Get a reference to the Firebase Storage bucket

// --- Express App Setup ---
const app = express();
// Use process.env.PORT for Render, fallback to 3000 for local development.
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for cross-origin requests from your frontend
app.use(express.static('public')); // Serve static files (like index.html, auth.html, CSS, JS) from the 'public' directory

// --- Multer Configuration (for in-memory storage for Firebase Storage upload) ---
// Files are temporarily stored in memory before being streamed to Firebase Storage.
const upload = multer({ storage: multer.memoryStorage() }).fields([
    { name: 'coverImageFile', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]);

app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// --- In-memory Session Management ---
const activeSessions = new Map(); // sessionId -> userId (cleared on server restart)

// --- Authentication Middleware ---
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

// --- Authentication Routes ---
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
            password, // Insecure for production. Hash passwords with bcrypt!
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
    // Generate a unique filename using timestamp and original name
    const filename = `${destinationFolder}/${Date.now()}-${file.originalname}`;
    const fileUpload = bucket.file(filename);

    // Create a write stream to upload the file buffer to Firebase Storage
    const blobStream = fileUpload.createWriteStream({
        metadata: {
            contentType: file.mimetype // Set content type based on the file's MIME type
        }
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (error) => {
            console.error('Error uploading to Firebase Storage:', error);
            reject('Upload failed.'); // Reject the promise on error
        });

        blobStream.on('finish', async () => {
            // Make the file publicly accessible. IMPORTANT: Review Firebase Storage Security Rules!
            await fileUpload.makePublic();
            // Construct the public URL for the uploaded file
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileUpload.name}`;
            resolve(publicUrl); // Resolve the promise with the public URL
        });

        // End the stream with the file's buffer, triggering the upload
        blobStream.end(file.buffer);
    });
}

// --- Book Upload Endpoint: Uploads files to Storage & saves details to Firestore ---
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
        // Retrieve file buffers from Multer's memory storage
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

            // Upload files to Firebase Storage if they exist
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
                uploadedByUserId: req.user.id, // ID of the user who uploaded
                uploadedAt: admin.firestore.FieldValue.serverTimestamp() // Timestamp
            };

            // Add the new book document to the 'books' collection in Firestore
            const docRef = await db.collection('books').add(newBookData);
            console.log('New book added to Firestore with ID:', docRef.id);

            res.status(200).json({
                message: 'Book uploaded successfully!',
                book: { id: docRef.id, ...newBookData }
            });
        } catch (error) {
            console.error('Error during book upload to Storage or Firestore:', error);
            res.status(500).json({ message: 'Failed to upload book data or files.' });
        }
    });
});

// --- Get All Books Endpoint: Fetches books from Firestore ---
app.get('/api/books', async (req, res) => {
    try {
        let booksQuery = db.collection('books');
        // Fetch all books, ordered by upload time (newest first)
        const snapshot = await booksQuery.orderBy('uploadedAt', 'desc').get();
        const books = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            books.push({
                id: doc.id, // Firestore document ID
                bookName: data.bookName,
                authorName: data.authorName,
                genre: data.genre,
                bookDescription: data.bookDescription,
                coverImageUrl: data.coverImageUrl, // Direct public URL from Firestore
                pdfDownloadUrl: data.pdfDownloadUrl, // Direct public URL from Firestore
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
// This endpoint provides a redirect to the public Firebase Storage URL for the PDF.
// This is protected by authentication.
app.get('/download-book/:bookId', isAuthenticated, async (req, res) => {
    const bookId = req.params.bookId; // The bookId is the Firestore document ID

    try {
        const bookDoc = await db.collection('books').doc(bookId).get();
        if (!bookDoc.exists) {
            return res.status(404).json({ message: 'Book not found.' });
        }

        const book = bookDoc.data();
        const pdfUrl = book.pdfDownloadUrl; // Get the Firebase Storage public URL from Firestore

        if (pdfUrl) {
            res.redirect(pdfUrl); // Redirect the client to the public URL of the PDF in Firebase Storage
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
            // Extract filename from the public URL and construct storage path
            const coverFileName = decodeURIComponent(bookData.coverImageUrl.split('/').pop().split('?')[0]);
            const coverFileRef = bucket.file(`covers/${coverFileName}`);
            await coverFileRef.delete().catch(err => console.warn('Warning: Could not delete cover image from storage:', err.message));
        }
        if (bookData.pdfDownloadUrl) {
            // Extract filename from the public URL and construct storage path
            const pdfFileName = decodeURIComponent(bookData.pdfDownloadUrl.split('/').pop().split('?')[0]);
            const pdfFileRef = bucket.file(`pdfs/${pdfFileName}`);
            await pdfFileRef.delete().catch(err => console.warn('Warning: Could not delete PDF from storage:', err.message));
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
    console.log('Firebase Storage and Firestore integration enabled.');
    console.log('***IMPORTANT: Ensure GOOGLE_APPLICATION_CREDENTIALS_JSON env var is set in production.***');
    console.log('***Review Firebase Storage and Firestore security rules for proper access control.***');
});
