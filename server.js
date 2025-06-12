// server.js - CRITICAL RE-CONFIRMED VERSION: Firebase Firestore Integration with Persistent Sessions
// This version ensures users and books are stored in your Firestore database.
// - Users can sign up and log in.
// - All uploaded books are publicly visible on the homepage.
// - Uploading and downloading books require a user to be logged in.
// - Prevents duplicate book uploads (same name and author).
// - NEW: Implements persistent user sessions by storing auth tokens in Firestore.
// - FIX: Loads service account key from environment variable for secure deployment.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto'); // Used for generating unique session tokens

// --- Firebase Admin SDK Setup ---
const admin = require('firebase-admin');

// IMPORTANT: Load service account key from environment variable for secure deployment.
// You must set an environment variable named FIREBASE_SERVICE_ACCOUNT_KEY in Render,
// with the entire JSON content of your serviceAccountKey.json file as its value.
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.error('ERROR: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set.');
    console.error('Please add your Firebase service account key JSON as an environment variable in Render.');
    process.exit(1); // Exit the process if the key is not found
}

// Parse the JSON string from the environment variable into a JavaScript object
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

// Initialize Firebase Admin SDK with your service account credentials
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore(); // Get a reference to the Firestore database service

// --- Express App Setup ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for cross-origin requests from your frontend
app.use(express.static('public')); // Serve static files (like index.html, auth.html, CSS, JS) from the 'public' directory

// --- File Upload Setup (Multer) ---
const uploadsDir = path.join(__dirname, 'uploads');
// Create the 'uploads' directory if it doesn't exist
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files statically via '/uploads/filename.ext' URL

// Configure Multer for file storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir); // Store files in the 'uploads' directory
    },
    filename: function (req, file, cb) {
        // Generate a unique filename by pre-pending a timestamp to the original filename
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage }).fields([
    { name: 'coverImageFile', maxCount: 1 }, // Allow one cover image file
    { name: 'pdfFile', maxCount: 1 }         // Allow one PDF file
]);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Authentication Middleware ---
// This middleware checks if a request is authenticated by validating the
// 'x-auth-token' header sent by the client against Firestore sessions.
const isAuthenticated = async (req, res, next) => {
    const authToken = req.headers['x-auth-token']; // Get the authentication token from the request headers

    if (!authToken) {
        return res.status(401).json({ message: 'Unauthorized: No authentication token provided.' });
    }

    try {
        // Query the 'sessions' collection for a session matching the provided authToken
        const sessionSnapshot = await db.collection('sessions').where('authToken', '==', authToken).limit(1).get();

        if (sessionSnapshot.empty) {
            return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
        }

        const sessionDoc = sessionSnapshot.docs[0];
        const sessionData = sessionDoc.data();
        const userId = sessionData.userId; // Get the userId associated with the valid session

        // Verify that the user associated with this session still exists
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            // If user doesn't exist, invalidate the session
            await db.collection('sessions').doc(sessionDoc.id).delete();
            return res.status(401).json({ message: 'Unauthorized: User associated with token not found.' });
        }

        // Attach user data to the request for use in subsequent middleware/routes
        req.user = { id: userId, ...userDoc.data() };
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Error verifying authentication token with Firestore:', error);
        res.status(500).json({ message: 'Internal server error during authentication.' });
    }
};

// --- Authentication Routes ---

// Signup Endpoint: Allows new users to register and saves to Firestore
app.post('/api/signup', async (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
        return res.status(400).json({ message: 'All fields (email, password, displayName) are required for signup.' });
    }
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        if (!snapshot.empty) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }
        const newUserRef = await usersRef.add({
            email,
            password, // IMPORTANT: In a real application, hash this password using bcrypt!
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

// Login Endpoint: Authenticates user and creates a persistent session in Firestore
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
        if (userData.password !== password) { // IMPORTANT: Compare with hashed password in a real app!
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // Generate a new unique session token
        const sessionToken = crypto.randomUUID();

        // Store the session token in Firestore
        await db.collection('sessions').add({
            userId: userDoc.id,
            authToken: sessionToken,
            loggedInAt: admin.firestore.FieldValue.serverTimestamp()
            // You might add an expiration time here for automatic cleanup
        });

        console.log('User logged in from Firestore:', userData.email, 'Session Token:', sessionToken);
        res.status(200).json({
            message: 'Login successful!',
            userId: userDoc.id,
            displayName: userData.displayName,
            authToken: sessionToken // Send the token back to the client
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// Logout Endpoint: Invalidates the user's current session token in Firestore
app.post('/api/logout', isAuthenticated, async (req, res) => {
    const authToken = req.headers['x-auth-token']; // Get the token from the header

    try {
        const sessionSnapshot = await db.collection('sessions').where('authToken', '==', authToken).limit(1).get();

        if (!sessionSnapshot.empty) {
            // Delete the session document from Firestore
            await db.collection('sessions').doc(sessionSnapshot.docs[0].id).delete();
            console.log(`Session for user ${req.user.id} (token: ${authToken}) deleted from Firestore.`);
            res.status(200).json({ message: 'Logged out successfully.' });
        } else {
            // Token not found or already invalidated
            res.status(404).json({ message: 'Session not found or already logged out.' });
        }
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ message: 'Internal server error during logout.' });
    }
});


// --- Book Upload Endpoint: Saves book details to Firestore ---
// This endpoint is protected by the `isAuthenticated` middleware.
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
            // Clean up uploaded files if validation fails
            if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
            if (pdfFile && fs.existsSync(pdfFile.path)) fs.unlinkSync(pdfFile.path);
            return res.status(400).json({ message: 'Book name, author, genre, and description are required.' });
        }

        // Note: coverImageUrl and pdfDownloadUrl are now derived on the frontend based on paths stored below
        // They are not directly stored in Firestore for this setup, as the backend serves the actual files.

        try {
            // --- Duplicate Book Check against Firestore ---
            const existingBooksQuery = await db.collection('books')
                .where('bookName', '==', bookName)
                .where('authorName', '==', authorName)
                .limit(1)
                .get();

            if (!existingBooksQuery.empty) {
                // Clean up uploaded files if duplicate
                if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
                if (pdfFile && fs.existsSync(pdfFile.path)) fs.unlinkSync(pdfFile.path);
                return res.status(409).json({ message: 'A book with this name and author already exists.' });
            }

            // Prepare new book data to be saved in Firestore
            const newBookData = {
                bookName,
                authorName,
                genre,
                bookDescription,
                coverImagePath: coverImageFile ? coverImageFile.path : null, // Store local path
                pdfPath: pdfFile ? pdfFile.path : null,                     // Store local path
                uploadedByUserId: req.user.id,                               // ID of the user who uploaded
                uploadedAt: admin.firestore.FieldValue.serverTimestamp()     // Timestamp
            };

            const docRef = await db.collection('books').add(newBookData);
            console.log('New book added to Firestore with ID:', docRef.id);

            res.status(200).json({
                message: 'Book uploaded successfully!',
                book: { id: docRef.id, ...newBookData }
            });
        } catch (error) {
            console.error('Error saving book to Firestore:', error);
            // Clean up uploaded files in case of a database error after successful file upload
            if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
            if (pdfFile && fs.existsSync(pdfFile.path)) fs.unlinkSync(pdfFile.path);
            res.status(500).json({ message: 'Failed to save book data to database.' });
        }
    });
});

// --- Get All Books Endpoint: Fetches books from Firestore ---
app.get('/api/books', async (req, res) => {
    try {
        let booksQuery = db.collection('books');
        // IMPORTANT: Add an index for 'uploadedAt' in Firestore if you don't have one!
        // The error message will tell you the exact index needed.
        const snapshot = await booksQuery.orderBy('uploadedAt', 'desc').get();
        const books = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            books.push({
                id: doc.id, // This will be the actual Firestore document ID
                bookName: data.bookName,
                authorName: data.authorName,
                genre: data.genre,
                bookDescription: data.bookDescription,
                // Construct full URL for cover image based on your server's static serving setup
                coverImageUrl: data.coverImagePath ? `${req.protocol}://${req.get('host')}/uploads/${path.basename(data.coverImagePath)}` : 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover',
                pdfDownloadUrl: data.pdfPath ? `${req.protocol}://${req.get('host')}/download-book/${doc.id}` : null,
                uploadedByUserId: data.uploadedByUserId // This will be the actual Firestore user ID
            });
        });
        console.log('Fetched ALL books from Firestore for public view. Number of books:', books.length);
        res.status(200).json(books);
    } catch (error) {
        console.error('Error fetching books from Firestore:', error);
        res.status(500).json({ message: 'Failed to fetch book data from database.' });
    }
});

// --- Book Download Endpoint: Fetches PDF path from Firestore ---
// This endpoint allows authenticated users to download a book's PDF.
app.get('/download-book/:bookId', isAuthenticated, async (req, res) => {
    const bookId = req.params.bookId;

    try {
        const bookDoc = await db.collection('books').doc(bookId).get();
        if (!bookDoc.exists) {
            return res.status(404).json({ message: 'Book not found.' });
        }

        const book = bookDoc.data();
        const filePath = book.pdfPath; // Get the local file path from Firestore data

        // Check if the file exists on the server's file system
        if (filePath && fs.existsSync(filePath)) {
            // `res.download` sends the file as a download to the client
            res.download(filePath, book.bookName + '.pdf', (err) => {
                if (err) {
                    console.error('Error downloading file:', err);
                    // Only send error if headers haven't already been sent
                    if (!res.headersSent) {
                        res.status(500).json({ message: 'Could not download the book.' });
                    }
                }
            });
        } else {
            res.status(404).json({ message: 'PDF file not found for this book.' });
        }
    } catch (error) {
        console.error('Error fetching book for download from Firestore:', error);
        res.status(500).json({ message: 'Internal server error during download.' });
    }
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Firestore integration enabled and ALL books are publicly displayed.');
    console.log('***IMPORTANT: Ensure your "serviceAccountKey.json" file is in the same directory as server.js.***');
    console.log('***Expected Firestore IDs for users and books will be long alphanumeric strings, not simple numbers.***');
    console.log('***Persistent sessions are now enabled via Firestore.***');
});
