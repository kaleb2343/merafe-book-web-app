// home page.js - UPDATED: All books are publicly visible, now uses dynamic BASE_URL for API calls

// IMPORTANT: Replace this with the actual live URL of your Render service.
// Example: const BASE_URL = 'https://your-app-name.onrender.com';
const BASE_URL = 'https://merafe-e-book.onrender.com'; // Your live Render URL

document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Status Check ---
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'; // Keep for general display logic
    const userId = localStorage.getItem('userId');
    const userDisplayName = localStorage.getItem('userDisplayName');
    const authToken = localStorage.getItem('authToken');

    // --- UI Elements ---
    const searchInput = document.getElementById('home-search-input');
    const newReleasesContainer = document.getElementById('new-releases-books');
    const profileIcon = document.getElementById('profile-icon');
    const addBookCard = document.querySelector('.add-book-card');
    const addBookButton = document.querySelector('.add-book-card button');
    const addBookModal = document.getElementById('add-book-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const addBookForm = document.getElementById('add-book-form');
    let userIdDisplayElement = document.getElementById('user-id-display'); // Assuming this exists in index.html

    const bookTitleInput = document.getElementById('book-name');
    const bookAuthorInput = document.getElementById('book-author');
    const bookGenreInput = document.getElementById('book-genre');
    const coverImageFileInput = document.getElementById('cover-image-file');
    const pdfFileInput = document.getElementById('pdf-file');
    const bookDescriptionInput = document.getElementById('book-description');

    // --- DEBUG: Initial UI Element Check (keep for debugging if needed) ---
    console.log('--- Initial UI Element Check ---');
    console.log('profileIcon:', profileIcon ? 'Found' : 'NULL');
    console.log('addBookCard:', addBookCard ? 'Found' : 'NULL');
    console.log('bookDescriptionInput:', bookDescriptionInput ? 'Found' : 'NULL');
    console.log('userIdDisplayElement:', userIdDisplayElement ? 'Found' : 'NULL');
    console.log('---------------------------------');

    // --- Display User Info (if logged in) and User ID or redirect to Auth Page ---
    if (profileIcon) {
        if (authToken && userDisplayName) {
            console.log(`User logged in: ${userDisplayName} (ID: ${userId}) - Token present`);
            if (userIdDisplayElement) {
                userIdDisplayElement.textContent = `User ID: ${userId.substring(0, 8)}...`;
                userIdDisplayElement.title = userId;
            }
        } else {
            console.log('User not logged in. Redirecting profile icon to auth page (or if no token).');
            if (userIdDisplayElement) {
                userIdDisplayElement.textContent = '';
            }
        }
        profileIcon.addEventListener('click', () => {
            window.location.href = 'auth.html';
        });
    }

    // --- Conditional visibility for "Add Book" card ---
    if (addBookCard) {
        if (authToken) {
            addBookCard.classList.remove('hidden'); // Show if logged in with a token
        } else {
            addBookCard.classList.add('hidden'); // Hide if no token
        }
    }

    // --- Function to fetch and display books ---
    async function fetchAndDisplayBooks() {
        console.log('Attempting to fetch and display ALL books...');
        newReleasesContainer.innerHTML = ''; // Clear existing content

        // Add the "Add your own book" card first if user has a token
        if (authToken && addBookCard) {
            console.log('Adding "Add your own book" card.');
            const clonedAddBookCard = addBookCard.cloneNode(true);
            clonedAddBookCard.classList.remove('hidden');
            clonedAddBookCard.querySelector('button').addEventListener('click', () => {
                addBookModal.classList.remove('hidden');
            });
            newReleasesContainer.appendChild(clonedAddBookCard);
        } else {
            console.log('User not logged in or no token, not adding "Add your own book" card.');
        }

        try {
            // UPDATED: Use BASE_URL for fetching books
            const response = await fetch(`${BASE_URL}/api/books`);

                        if (!response.ok) {
                            console.error(`Failed to fetch books: HTTP error! status: ${response.status}`);
                            return; // Optionally stop execution if fetch failed
                        }

                        // You may want to add the rest of your fetchAndDisplayBooks logic here
                        // For example, display the books here
                        const books = await response.json();
                        // Render books (implement your rendering logic)
                        console.log('Fetched books:', books);
                    } catch (error) {
                        console.error('Error fetching books:', error);
                    }
                }

                // Optionally, call fetchAndDisplayBooks here if you want to load books on page load
                fetchAndDisplayBooks();
            });