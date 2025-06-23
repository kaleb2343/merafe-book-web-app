// netlify/functions/upload-book.js

// Import Supabase client for database and storage interaction.
// Import Firebase Admin SDK for authentication token verification.
// Import Busboy to parse multipart/form-data requests (for file uploads).
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');
const Busboy = require('busboy'); // Make sure this is installed via `npm install busboy`

// Initialize Firebase Admin SDK for authentication token verification.
// Ensures it's initialized only once.
if (!admin.apps.length) {
    try {
        // Ensure the private key is correctly parsed by replacing escaped newlines.
        const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY ?
                                   process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') :
                                   ''; // Default to empty string if undefined

        if (!firebasePrivateKey) {
            console.error('FIREBASE_PRIVATE_KEY environment variable is empty or undefined.');
            throw new Error('Firebase Private Key is not set or invalid.'); // Throw to catch in outer block
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: firebasePrivateKey, // Use the processed variable
            }),
        });
        console.log('Firebase Admin SDK initialized successfully for upload-book (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for upload-book:', error);
        console.error('Full Firebase Admin SDK init error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        // IMPORTANT: If initialization fails, you might want to re-throw or handle it more explicitly
        // to prevent the function from proceeding with uninitialized Firebase services.
        throw error; // Re-throw to propagate the initialization error
    }
}
// Initialize Supabase client for database and object storage operations.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to parse multipart/form-data requests (file uploads).
// This is necessary because Netlify Functions receive the raw request body.
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: event.headers
        });

        const fields = {}; // Stores form text fields
        const files = {};   // Stores uploaded file details (paths and public URLs)
        let fileUploadPromises = []; // Array to track async file uploads to Supabase Storage

        // Listener for file parts in the multipart form.
        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            console.log(`File [${fieldname}]: filename: ${filename.filename}, encoding: ${encoding}, mimetype: ${mimetype}`);

            // Create a unique filename to avoid collisions in storage.
            const uniqueFilename = `${Date.now()}-${filename.filename}`;
            let bucketName = '';

            // Determine which Supabase Storage bucket to use based on the fieldname.
            if (fieldname === 'pdfFile') {
                bucketName = 'book-pdfs';
            } else if (fieldname === 'coverImageFile') {
                bucketName = 'book-covers';
            } else {
                // Reject if an unsupported file field is encountered.
                reject(new Error(`Unsupported file field: ${fieldname}`));
                return;
            }

            const fileBuffer = []; // Buffer to accumulate file data chunks.
            file.on('data', data => {
                fileBuffer.push(data);
            });

            // Add a promise for each file upload to the fileUploadPromises array.
            fileUploadPromises.push(new Promise(async (res, rej) => {
                file.on('end', async () => {
                    const buffer = Buffer.concat(fileBuffer); // Combine all chunks into a single buffer.
                    try {
                        // Upload the file buffer to the specified Supabase Storage bucket.
                        const { data, error } = await supabase.storage
                            .from(bucketName)
                            .upload(uniqueFilename, buffer, {
                                contentType: mimetype, // Set content type for proper serving.
                                upsert: true, // If a file with the same name exists, it will be overwritten.
                            });

                        if (error) {
                            console.error('Supabase upload error:', error);
                            return rej(error); // Reject the promise on upload error.
                        }

                        // Construct the public URL for the uploaded file.
                        // Supabase public URLs follow a predictable pattern.
                        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${uniqueFilename}`;
                        console.log(`Uploaded to ${publicUrl}`);

                        // Store the file's internal path and public URL.
                        files[fieldname] = {
                            path: uniqueFilename, // Used for internal reference if needed.
                            url: publicUrl // The URL to store in the database for display/download.
                        };
                        res(); // Resolve the promise once upload is successful.
                    } catch (err) {
                        console.error('Error during Supabase upload process:', err);
                        rej(err); // Reject on any other error during the process.
                    }
                });
            }));
        });

        // Listener for regular form text fields.
        busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
            fields[fieldname] = val; // Store field values.
        });

        // Listener for when Busboy finishes parsing the form.
        busboy.on('finish', async () => {
            try {
                // Wait for all file upload promises to complete.
                await Promise.all(fileUploadPromises);
                resolve({ fields, files }); // Resolve the main promise with all parsed data.
            } catch (err) {
                reject(err); // Reject if any file upload failed.
            }
        });

        // Listener for Busboy errors.
        busboy.on('error', reject);

        // Pipe the event body to Busboy for parsing.
        // event.isBase64Encoded indicates if the body needs decoding.
        busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    });
}

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
                'Access-Control-Max-Age': '86400', // Cache preflight response for 24 hours
            },
            body: '',
        };
    }

    // Only allow POST requests for book uploads.
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    // Extract and validate authentication token from headers.
    const authToken = event.headers['x-auth-token'];
    if (!authToken) {
        console.error('No authentication token provided in x-auth-token header.');
        return {
            statusCode: 401, // Unauthorized
            body: JSON.stringify({ message: 'Authentication token required.' }),
        };
    }

    let decodedToken;
    try {
        // Verify the user's Firebase Auth token
        // Log part of the token for debugging (never log the full token in production!)
        console.log('Attempting Firebase token verification for token start:', authToken ? authToken.substring(0, 10) + '...' : 'No token provided (unexpected at this point).');
        
        decodedToken = await admin.auth().verifyIdToken(authToken);
        
        // Log success if verification passes
        console.log('Token successfully verified for UID:', decodedToken.uid); 
    } catch (error) {
        // Log a more specific error message for easier identification in Netlify logs
        console.error('Token verification failed inside upload-book.js:', error); 
        
        // Log the full error object, including non-enumerable properties like 'code', 'name', 'stack'
        // This gives the most detailed error information from Firebase Admin SDK.
        console.error('Full token verification error object (JSON stringified):', JSON.stringify(error, Object.getOwnPropertyNames(error)));

        return {
            statusCode: 401, // Unauthorized
            body: JSON.stringify({ message: 'Invalid or expired authentication token. Please log in again.' }),
        };
    }

    try {
        // Parse the incoming multipart form data to get fields and files.
        const { fields, files } = await parseMultipartForm(event);

        // Destructure book details from the parsed fields.
        const { bookName, authorName, genre, bookDescription } = fields;
        const pdfFile = files.pdfFile;
        const coverImageFile = files.coverImageFile;

        // Validate required fields.
        if (!bookName || !authorName || !genre || !pdfFile) {
            console.error('Missing required book details or PDF file.');
            return {
                statusCode: 400, // Bad Request
                body: JSON.stringify({ message: 'Missing required book details or PDF file.' }),
            };
        }

        // Prepare the new book object for insertion into Supabase.
        const newBook = {
            bookName: bookName,
            authorName: authorName,
            genre: genre,
            bookDescription: bookDescription || '', // Use empty string if description is not provided.
            uploadedBy: decodedToken.uid, // Store the Firebase UID of the user who uploaded the book.
            // 'uploadedat' column in Supabase is configured to have a default timestamp, so no need to set it here.
            pdfPath: pdfFile.path, // Store the internal path/filename in Supabase Storage.
            pdfDownloadUrl: pdfFile.url, // Store the public direct URL for the PDF.
            // Use placeholder if no cover image is uploaded.
            coverImageUrl: coverImageFile ? coverImageFile.url : 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover',
        };

        // Insert the new book record into the 'books' table in Supabase.
        const { data, error } = await supabase
            .from('books')
            .insert([newBook])
            .select(); // Use .select() to return the inserted data, including the generated ID.

        if (error) {
            console.error('Supabase insert book error:', error);
            return {
                statusCode: 500, // Internal Server Error
                body: JSON.stringify({ message: `Failed to save book details to database: ${error.message}` }),
            };
        }

        // Return a success response with the new book's details.
        return {
            statusCode: 201, // Created
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*', // Adjust in production
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: JSON.stringify({
                message: 'Book uploaded successfully!',
                // Return the generated ID from Supabase and the rest of the new book data.
                bookId: data && data.length > 0 ? data[0].id : 'unknown',
                ...newBook // Return the full book object with URLs
            }),
        };

    } catch (error) {
        // Catch any general errors during the function execution (e.g., parsing errors).
        console.error('Netlify function upload-book general error:', error);
        return {
            statusCode: 500, // Internal Server Error
            body: JSON.stringify({ message: `Internal server error during book upload: ${error.message}` }),
        };
    }
};
