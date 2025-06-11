// server.js - CRITICAL RE-CONFIRMED VERSION: Firebase Firestore Integration
// This version ensures users and books are stored in your Firestore database.
// - Users can sign up and log in.
// - All uploaded books are publicly visible on the homepage.
// - Uploading and downloading books require a user to be logged in.
// - Prevents duplicate book uploads (same name and author).

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto'); // Node.js built-in module for cryptographic functions

// --- Firebase Admin SDK Setup ---
const admin = require('firebase-admin');

// IMPORTANT: This line uses the serviceAccountKey.json file you just placed.
// Ensure the file is named 'serviceAccountKey.json' and is in the same directory as server.js.
const serviceAccount = require('./serviceAccountKey.json'); 

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
        // Generate a unique filename by prepending a timestamp to the original filename
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage }).fields([
    { name: 'coverImageFile', maxCount: 1 }, // Allow one cover image file
    { name: 'pdfFile', maxCount: 1 }         // Allow one PDF file
]);

app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded request bodies

// --- In-memory Session Management ---
// Stores active session tokens mapped to user IDs.
// Note: This map is cleared when the server restarts. For persistent sessions,
// a more robust solution (e.g., storing sessions in Firestore) would be needed.
const activeSessions = new Map(); // sessionId -> userId

// --- Authentication Middleware ---
// This middleware checks if a request is authenticated by validating the
// 'x-auth-token' header sent by the client.
const isAuthenticated = async (req, res, next) => {
    const authToken = req.headers['x-auth-token']; // Get the authentication token from the request headers

    if (!authToken) {
        // If no token is provided, the request is unauthorized
        return res.status(401).json({ message: 'Unauthorized: No authentication token provided.' });
    }

    const userId = activeSessions.get(authToken); // Retrieve the userId associated with the token from active sessions map

    if (!userId) {
        // If the token is not found in active sessions, it's invalid or expired
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired token.' });
    }

    try {
        // Verify that the user associated with the token still exists in Firestore
        // This is crucial for security and data integrity.
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            // If the user document doesn't exist (e.g., user deleted or database cleared),
            // remove the session and return unauthorized.
            activeSessions.delete(authToken); // Clean up the invalid session token
            return res.status(401).json({ message: 'Unauthorized: User associated with token not found.' });
        }
        // Attach the user's data (including their Firestore ID) to the request for subsequent handlers
        req.user = { id: userId, ...userDoc.data() };
        next(); // Proceed to the next middleware or route handler
    } catch (error) {
        console.error('Error verifying user token with Firestore:', error);
        res.status(500).json({ message: 'Internal server error during authentication.' });
    }
};

// --- Authentication Routes ---

// Signup Endpoint: Allows new users to register and saves to Firestore
app.post('/api/signup', async (req, res) => {
    const { email, password, displayName } = req.body;

    // Validate required fields
    if (!email || !password || !displayName) {
        return res.status(400).json({ message: 'All fields are required for signup.' });
    }

    try {
        const usersRef = db.collection('users');
        // Check if a user with the provided email already exists in Firestore
        const snapshot = await usersRef.where('email', '==', email).get();
        if (!snapshot.empty) {
            return res.status(409).json({ message: 'User with this email already exists.' });
        }

        // Add the new user's data to the 'users' collection in Firestore
        // Firestore automatically generates a unique ID for new documents added this way.
        const newUserRef = await usersRef.add({
            email,
            password, // Store password (insecure for production, hash using bcrypt in a real app!)
            displayName,
            createdAt: admin.firestore.FieldValue.serverTimestamp() // Firestore timestamp for creation
        });
        // This console log will now show the actual Firestore document ID
        console.log('New user signed up in Firestore with ID:', newUserRef.id);

        res.status(201).json({ message: 'Signup successful! Please log in.' });
    } catch (error) {
        console.error('Error during signup:', error);
        res.status(500).json({ message: 'Internal server error during signup.' });
    }
});

// Login Endpoint: Authenticates existing users against Firestore
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required for login.' });
    }

    try {
        const usersRef = db.collection('users');
        // Find the user by email in Firestore
        const snapshot = await usersRef.where('email', '==', email).get();

        if (snapshot.empty) {
            // User not found
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        // Compare provided password with stored password
        if (userData.password !== password) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        // Generate a unique session token for the authenticated user
        const sessionToken = crypto.randomUUID();
        // Store the token and link it to the user's Firestore document ID
        activeSessions.set(sessionToken, userDoc.id);

        console.log('User logged in from Firestore:', userData.email, 'Session Token:', sessionToken);
        res.status(200).json({
            message: 'Login successful!',
            userId: userDoc.id,       // Send the user's actual Firestore document ID
            displayName: userData.displayName,
            authToken: sessionToken   // Send the generated session token to the client
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error during login.' });
    }
});

// --- Book Upload Endpoint: Saves book details to Firestore ---
// This endpoint is protected by the `isAuthenticated` middleware.
app.post('/upload-book', isAuthenticated, (req, res) => {
    // Multer handles file uploads first
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

        // Validate required book fields
        if (!bookName || !authorName || !genre || !bookDescription) {
            // Clean up uploaded files if validation fails
            if (coverImageFile && fs.existsSync(coverImageFile.path)) fs.unlinkSync(coverImageFile.path);
            if (pdfFile && fs.existsSync(pdfFile.path)) fs.unlinkSync(pdfFile.path);
            return res.status(400).json({ message: 'Book name, author, genre, and description are required.' });
        }

        try {
            // --- Duplicate Book Check against Firestore ---
            const existingBooksQuery = await db.collection('books')
                .where('bookName', '==', bookName)
                .where('authorName', '==', authorName)
                .limit(1)
                .get();

            if (!existingBooksQuery.empty) {
                // If a duplicate is found, delete the newly uploaded files to prevent clutter
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

            // Add the new book document to the 'books' collection in Firestore
            const docRef = await db.collection('books').add(newBookData);
            // This console log will now show the actual Firestore document ID
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
// This endpoint retrieves all books from Firestore for public display.
app.get('/api/books', async (req, res) => {
    try {
        let booksQuery = db.collection('books');
        // Fetch all books, ordered by upload time (newest first)
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
                coverImageUrl: data.coverImagePath ? `/uploads/${path.basename(data.coverImagePath)}` : null,
                pdfDownloadUrl: data.pdfPath ? `/download-book/${doc.id}` : null,
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
    const bookId = req.params.bookId; // The bookId is the Firestore document ID

    try {
        // Retrieve book details from Firestore using the document ID
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
});
