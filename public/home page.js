// home page.js - UPDATED: All books are publicly visible, now uses dynamic BASE_URL for API calls
// Also ensures authentication tokens are sent for protected actions (upload/download)
// and adds basic logout functionality.

const BASE_URL = 'https://merafe-e-book.onrender.com'; // Your live Render URL

document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Status Check ---
    let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    let userId = localStorage.getItem('userId');
    let userDisplayName = localStorage.getItem('userDisplayName');
    let authToken = localStorage.getItem('authToken');

    // --- UI Elements ---
    const searchInput = document.getElementById('home-search-input');
    const newReleasesContainer = document.getElementById('new-releases-books');
    const profileIcon = document.getElementById('profile-icon');
    const addBookCard = document.querySelector('.add-book-card');
    const addBookButton = document.querySelector('.add-book-card button');
    const addBookModal = document.getElementById('add-book-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const addBookForm = document.getElementById('add-book-form');
    const userIdDisplayElement = document.getElementById('user-id-display'); // Assuming this exists in index.html
    const logoutButton = document.getElementById('logout-button'); // Added logout button

    const bookTitleInput = document.getElementById('book-name');
    const bookAuthorInput = document.getElementById('book-author');
    const bookGenreInput = document.getElementById('book-genre');
    const bookDescriptionInput = document.getElementById('book-description');
    const coverImageFileInput = document.getElementById('cover-image-file');
    const pdfFileInput = document.getElementById('pdf-file');

    // --- Function to update UI based on login status ---
    function updateLoginUI() {
        if (isLoggedIn) {
            if (profileIcon) profileIcon.style.display = 'block';
            if (addBookCard) addBookCard.style.display = 'flex'; // Show add book card
            if (userIdDisplayElement) {
                userIdDisplayElement.textContent = `Logged in as: ${userDisplayName || userId}`;
                userIdDisplayElement.style.display = 'block';
            }
            if (logoutButton) logoutButton.style.display = 'block';
        } else {
            if (profileIcon) profileIcon.style.display = 'none';
            if (addBookCard) addBookCard.style.display = 'none'; // Hide add book card
            if (userIdDisplayElement) userIdDisplayElement.style.display = 'none';
            if (logoutButton) logoutButton.style.display = 'none';
        }
    }

    // --- Logout Functionality ---
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            if (authToken) {
                try {
                    const response = await fetch(`${BASE_URL}/api/logout`, {
                        method: 'POST',
                        headers: {
                            'x-auth-token': authToken
                        }
                    });

                    if (response.ok) {
                        console.log('Logged out successfully from backend.');
                    } else {
                        const errorData = await response.json();
                        console.error('Logout failed on server:', errorData.message);
                    }
                } catch (error) {
                    console.error('Network error during logout:', error);
                }
            }

            // Clear local storage regardless of backend response
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userId');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('userDisplayName');
            localStorage.removeItem('authToken');

            // Update UI and redirect to login page
            isLoggedIn = false;
            userId = null;
            userDisplayName = null;
            authToken = null;
            updateLoginUI();
            window.location.href = 'auth.html'; // Redirect to login page
        });
    }


    // --- Fetch and Display Books ---
    async function fetchAndDisplayBooks(searchTerm = '') {
        try {
            const response = await fetch(`${BASE_URL}/api/books`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const books = await response.json();
            console.log('Fetched books:', books);

            const filteredBooks = books.filter(book =>
                book.bookName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                book.authorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                book.genre.toLowerCase().includes(searchTerm.toLowerCase())
            );

            newReleasesContainer.innerHTML = ''; // Clear existing books
            if (filteredBooks.length === 0) {
                newReleasesContainer.innerHTML = '<p class="text-gray-600 dark:text-gray-400">No books found matching your criteria.</p>';
            }

            filteredBooks.forEach(book => {
                const bookCard = document.createElement('div');
                bookCard.className = 'book-card bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md flex flex-col items-center text-center';
                bookCard.innerHTML = `
                    <img src="${book.coverImageUrl || 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover'}" alt="${book.bookName}" class="w-full h-48 object-cover rounded-md mb-4">
                    <h3 class="text-lg font-semibold text-[#141414] dark:text-gray-100">${book.bookName}</h3>
                    <p class="text-gray-600 dark:text-gray-300">by ${book.authorName}</p>
                    <p class="text-gray-500 dark:text-gray-400 text-sm mb-4">${book.genre}</p>
                    <p class="text-gray-700 dark:text-gray-200 text-sm mb-4 flex-grow">${book.bookDescription}</p>
                    ${book.pdfDownloadUrl ? `<button class="download-button mt-auto px-4 py-2 bg-[#141414] text-white rounded-md hover:bg-gray-800 transition-colors" data-book-id="${book.id}">Download PDF</button>` : ''}
                `;
                newReleasesContainer.appendChild(bookCard);
            });

            // Add event listeners to download buttons
            document.querySelectorAll('.download-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    if (!isLoggedIn || !authToken) {
                        alert('You must be logged in to download books.'); // Use a custom modal in production
                        window.location.href = 'auth.html';
                        return;
                    }

                    const bookId = event.target.dataset.bookId;
                    try {
                        // Pass authToken in the header for download
                        const response = await fetch(`${BASE_URL}/download-book/${bookId}`, {
                            method: 'GET',
                            headers: {
                                'x-auth-token': authToken
                            }
                        });

                        if (response.ok) {
                            // Trigger file download
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = downloadUrl;
                            // Extract filename from Content-Disposition header if available, otherwise default
                            const contentDisposition = response.headers.get('Content-Disposition');
                            let filename = 'book.pdf'; // Default filename
                            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                                const matches = filenameRegex.exec(contentDisposition);
                                if (matches != null && matches[1]) {
                                    filename = matches[1].replace(/['"]/g, '');
                                }
                            }
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(downloadUrl);
                            console.log('Book downloaded successfully!');
                        } else {
                            const errorData = await response.json();
                            console.error('Download failed:', errorData.message);
                            alert(`Download failed: ${errorData.message}`); // Use custom modal
                        }
                    } catch (error) {
                        console.error('Error during download:', error);
                        alert('An error occurred during download. Please try again.'); // Use custom modal
                    }
                });
            });
        } catch (error) {
            console.error('Failed to fetch books:', error);
            newReleasesContainer.innerHTML = '<p class="text-red-500">Failed to load books. Please try again later.</p>';
        }
    }

    // --- Search functionality ---
    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            fetchAndDisplayBooks(event.target.value);
        });
    }

    // --- Add Book Modal Logic ---
    if (addBookButton) {
        addBookButton.addEventListener('click', () => {
            if (!isLoggedIn) {
                alert('You must be logged in to upload a book.'); // Use a custom modal in production
                window.location.href = 'auth.html';
                return;
            }
            addBookModal.classList.remove('hidden');
        });
    }

    if (closeModalButton) {
        closeModalButton.addEventListener('click', () => {
            addBookModal.classList.add('hidden');
            addBookForm.reset();
        });
    }

    // --- Handle Add Book Form Submission ---
    if (addBookForm) {
        addBookForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!isLoggedIn || !authToken) {
                alert('You must be logged in to upload a book.'); // Use a custom modal in production
                window.location.href = 'auth.html';
                return;
            }

            const bookName = bookTitleInput.value.trim();
            const authorName = bookAuthorInput.value.trim();
            const genre = bookGenreInput.value.trim();
            const bookDescription = bookDescriptionInput.value.trim();
            const coverImageFile = coverImageFileInput.files[0];
            const pdfFile = pdfFileInput.files[0];

            if (!bookName || !authorName || !genre || !bookDescription || !pdfFile) {
                alert('Please fill in all required fields and select a PDF file.'); // Use custom modal
                return;
            }

            const formData = new FormData();
            formData.append('bookName', bookName);
            formData.append('authorName', authorName);
            formData.append('genre', genre);
            formData.append('bookDescription', bookDescription);
            if (coverImageFile) {
                formData.append('coverImageFile', coverImageFile);
            }
            formData.append('pdfFile', pdfFile);

            try {
                const response = await fetch(`${BASE_URL}/upload-book`, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        // IMPORTANT: Do NOT set 'Content-Type': 'multipart/form-data' here.
                        // The browser sets it automatically with the correct boundary when using FormData.
                        'x-auth-token': authToken // Include the authentication token
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Book uploaded successfully response:', result);
                    alert('Book added successfully!'); // Use custom modal
                    addBookModal.classList.add('hidden');
                    addBookForm.reset();
                    await fetchAndDisplayBooks(); // Re-fetch books to show the new one
                } else {
                    const errorData = await response.json();
                    console.error('Book upload failed:', errorData.message);
                    alert(`Book upload failed: ${errorData.message}`); // Use custom modal
                }
            } catch (error) {
                console.error('Error during book upload:', error);
                alert('An error occurred during book upload. Please try again.'); // Use custom modal
            }
        });
    }

    // --- Initial Load ---
    updateLoginUI();
    fetchAndDisplayBooks(); // Initial fetch of all books
});
