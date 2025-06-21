// netlify/functions/upload-book.js

// Import Supabase client and Firebase Admin SDK (for auth only)
const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');
const Busboy = require('busboy'); // Library to parse multipart/form-data requests

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
        console.log('Firebase Admin SDK initialized successfully for upload-book (auth only).');
    } catch (error) {
        console.error('Firebase Admin SDK initialization error for upload-book:', error);
    }
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to parse multipart/form-data
function parseMultipartForm(event) {
    return new Promise((resolve, reject) => {
        const busboy = Busboy({
            headers: event.headers
        });

        const fields = {};
        const files = {};
        let fileUploadPromises = [];

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            console.log(`File [${fieldname}]: filename: %j, encoding: %j, mimetype: %j`, filename.filename, encoding, mimetype);

            const uniqueFilename = `${Date.now()}-${filename.filename}`;
            let bucketName = '';

            if (fieldname === 'pdfFile') {
                bucketName = 'book-pdfs'; // Your Supabase Storage bucket for PDFs
            } else if (fieldname === 'coverImageFile') {
                bucketName = 'book-covers'; // Your Supabase Storage bucket for cover images
            } else {
                reject(new Error(`Unsupported file field: ${fieldname}`));
                return;
            }

            const fileBuffer = [];
            file.on('data', data => {
                fileBuffer.push(data);
            });

            fileUploadPromises.push(new Promise(async (res, rej) => {
                file.on('end', async () => {
                    const buffer = Buffer.concat(fileBuffer);
                    try {
                        const { data, error } = await supabase.storage
                            .from(bucketName)
                            .upload(uniqueFilename, buffer, {
                                contentType: mimetype,
                                upsert: true, // Overwrite if file exists
                            });

                        if (error) {
                            console.error('Supabase upload error:', error);
                            return rej(error);
                        }

                        // Construct the public URL for Supabase Storage
                        // Supabase public URLs are predictable: [SUPABASE_URL]/storage/v1/object/public/[bucket_name]/[file_path]
                        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${uniqueFilename}`;
                        console.log(`Uploaded to ${publicUrl}`);

                        files[fieldname] = {
                            path: uniqueFilename, // This is just the filename for internal reference
                            url: publicUrl // The full public URL
                        };
                        res();
                    } catch (err) {
                        console.error('Error during Supabase upload process:', err);
                        rej(err);
                    }
                });
            }));
        });

        busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) => {
            fields[fieldname] = val;
        });

        busboy.on('finish', async () => {
            try {
                await Promise.all(fileUploadPromises);
                resolve({ fields, files });
            } catch (err) {
                reject(err);
            }
        });

        busboy.on('error', reject);

        busboy.end(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    });
}


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

    if (event.httpMethod !== 'POST') {
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

    let decodedToken;
    try {
        // Verify the user's Firebase Auth token
        decodedToken = await admin.auth().verifyIdToken(authToken);
    } catch (error) {
        console.error('Token verification failed:', error);
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Invalid or expired authentication token. Please log in again.' }),
        };
    }

    try {
        const { fields, files } = await parseMultipartForm(event);

        const { bookName, authorName, genre, bookDescription } = fields;
        const pdfFile = files.pdfFile;
        const coverImageFile = files.coverImageFile;

        if (!bookName || !authorName || !genre || !pdfFile) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Missing required book details or PDF file.' }),
            };
        }

        const newBook = {
            bookName: bookName,
            authorName: authorName,
            genre: genre,
            bookDescription: bookDescription || '',
            uploadedBy: decodedToken.uid, // Firebase UID of the uploader
            // uploadedAt will be set by the database default value
            pdfPath: pdfFile.path, // Filename in Supabase Storage
            pdfDownloadUrl: pdfFile.url, // Public URL from Supabase Storage
            coverImageUrl: coverImageFile ? coverImageFile.url : 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover', // Public URL from Supabase Storage
        };

        // Insert new book record into Supabase 'books' table
        const { data, error } = await supabase
            .from('books')
            .insert([newBook]);

        if (error) {
            console.error('Supabase insert book error:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: `Failed to save book details to database: ${error.message}` }),
            };
        }

        return {
            statusCode: 201, // 201 Created
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, x-auth-token',
            },
            body: JSON.stringify({
                message: 'Book uploaded successfully!',
                // Supabase insert response might not include the full inserted object with ID easily
                // You might need a .select() after insert for the full data, or just return what you sent.
                // For now, returning the newBook data as sent by the client + Supabase response data if available.
                // Assuming data[0] contains the inserted row.
                bookId: data && data.length > 0 ? data[0].id : 'unknown',
                ...newBook // Return the full book object with URLs
            }),
        };

    } catch (error) {
        console.error('Netlify function upload-book general error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Internal server error during book upload: ${error.message}` }),
        };
    }
};
