// home page.js - FINAL VERSION: Adapted for original index.html UI, preserves functionality.
// Added console logs to help debug authentication token issues.

// IMPORTANT: Replace 'YOUR_NETLIFY_SITE_URL_HERE' with your actual Netlify site URL (e.g., https://your-site-name-xxxxxx.netlify.app)
const BASE_URL = 'merafe.netlify.app'; 

document.addEventListener('DOMContentLoaded', () => {
    // --- Authentication Status Check ---
    let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    let userId = localStorage.getItem('userId');
    let userDisplayName = localStorage.getItem('userDisplayName');
    let authToken = localStorage.getItem('authToken');

    console.log('Page loaded. Is Logged In:', isLoggedIn, 'Auth Token (on load):', authToken);

    // --- UI Elements ---
    const searchInput = document.getElementById('home-search-input');
    const newReleasesContainer = document.getElementById('new-releases-books');
    const profileIcon = document.getElementById('profile-icon'); // Existing profile icon element
    const addBookCard = document.querySelector('.add-book-card'); // Existing add book card
    const addBookButton = addBookCard ? addBookCard.querySelector('button') : null; // Button inside add book card
    const addBookModal = document.getElementById('add-book-modal');
    const closeModalButton = document.getElementById('close-modal-button');
    const addBookForm = document.getElementById('add-book-form');

    const bookTitleInput = document.getElementById('book-name');
    const bookAuthorInput = document.getElementById('book-author');
    const bookGenreInput = document.getElementById('book-genre');
    const bookDescriptionInput = document.getElementById('book-description'); // Ensure this matches your modal form
    const coverImageFileInput = document.getElementById('cover-image-file');
    const pdfFileInput = document.getElementById('pdf-file');

    // --- Function to update UI based on login status ---
    function updateLoginUI() {
        // Toggle visibility of "Add Book" card
        if (addBookCard) {
            if (isLoggedIn) {
                addBookCard.classList.remove('hidden'); // Show add book card
            } else {
                addBookCard.classList.add('hidden'); // Hide add book card
            }
        }
        // Profile icon behavior remains for navigation/logout
    }

    // --- Profile Icon / Logout Logic ---
    if (profileIcon) {
        profileIcon.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevent default navigation initially

            if (isLoggedIn && authToken) {
                // Using standard confirm for simplicity as per current pattern. Replace with custom modal in production.
                const wantsToLogout = confirm(`Are you sure you want to log out?`);
                if (wantsToLogout) {
                    console.log('Attempting logout with token:', authToken);
                    try {
                        // All API calls will now go to Netlify Functions or directly to Firebase where applicable
                        const response = await fetch(`${BASE_URL}/.netlify/functions/logout`, { // Assuming a logout function
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
                            console.log('Logout failed on server:', errorData.message); // Placeholder for custom modal
                        }
                    } catch (error) {
                        console.error('Network error during logout:', error);
                        console.log('Network error during logout. Please try again.'); // Placeholder for custom modal
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
                    updateLoginUI(); // Update visibility after logout
                    window.location.href = 'auth.html'; // Redirect to login page
                }
            } else {
                // If not logged in, redirect to auth.html
                window.location.href = 'auth.html';
            }
        });
    }

    // --- Fetch and Display Books ---
    async function fetchAndDisplayBooks(searchTerm = '') {
        try {
            // Updated API endpoint to Netlify Function
            const response = await fetch(`${BASE_URL}/.netlify/functions/get-books`); // Assuming a get-books function
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

            // Clear existing books but keep the "Add your own book" placeholder if it exists in HTML
            // Get a reference to the existing add-book-card BEFORE clearing innerHTML
            const existingAddBookCardElement = document.querySelector('.add-book-card');
            const parentOfBooks = document.getElementById('new-releases-books');
            
            // Clear content, but temporarily store the add book card if it exists
            let tempAddBookCardHtml = '';
            if (existingAddBookCardElement && existingAddBookCardElement.parentNode === parentOfBooks) {
                tempAddBookCardHtml = existingAddBookCardElement.outerHTML;
            }
            parentOfBooks.innerHTML = ''; // Clear all existing content


            if (filteredBooks.length === 0 && !isLoggedIn) {
                parentOfBooks.innerHTML = '<p class="text-gray-600">No books found matching your criteria. Log in to add your own!</p>';
            } else if (filteredBooks.length === 0 && isLoggedIn) {
                parentOfBooks.innerHTML = '<p class="text-gray-600">No books found matching your criteria.</p>';
            }


            // Re-insert the Add Book card at the beginning if it was originally there and user is logged in
            if (isLoggedIn && tempAddBookCardHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = tempAddBookCardHtml;
                const reAddedCard = tempDiv.firstElementChild; // Get the actual element
                parentOfBooks.insertBefore(reAddedCard, parentOfBooks.firstChild);

                // Re-attach event listener to the re-added button
                const reAddedAddBookButton = reAddedCard.querySelector('button');
                if (reAddedAddBookButton) {
                    reAddedAddBookButton.addEventListener('click', showAddBookModal);
                }
            }
            

            // Add dynamic book cards after the potential "add book" card
            filteredBooks.forEach(book => {
                const bookCard = document.createElement('div');
                bookCard.className = 'flex flex-col gap-3 pb-3 h-full justify-between book-card'; // Ensure this matches your CSS
                bookCard.innerHTML = `
                    <div class="flex w-full bg-center bg-no-repeat aspect-[3/4] bg-cover rounded-xl" style="background-image: url('${book.coverImageUrl || 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover'}');"></div>
                    <p class="book-title text-[#141414] text-left text-base font-medium leading-normal">${book.bookName}</p>
                    <p class="text-gray-600 text-sm">by ${book.authorName}</p>
                    <p class="text-gray-500 text-xs">${book.genre}</p>
                    <p class="text-gray-700 text-sm flex-grow">${book.bookDescription}</p>
                    ${book.pdfDownloadUrl ? `
                        <button class="download-button mt-2 w-full border border-[#141414] text-[#141414] py-1 px-2 rounded-md text-xs font-medium hover:bg-[#141414] hover:text-white transition-colors duration-200" data-book-id="${book.id}" data-book-name="${book.bookName}">
                            Download PDF
                        </button>` : ''}
                `;
                parentOfBooks.appendChild(bookCard);
            });


            // Add event listeners to download buttons (needs to be done after all cards are rendered)
            document.querySelectorAll('.download-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    if (!isLoggedIn || !authToken) {
                        console.log('You must be logged in to download books.'); // Placeholder for custom modal
                        window.location.href = 'auth.html';
                        return;
                    }
                    console.log('Attempting download with token:', authToken); // Log token before download
                    const bookId = event.target.dataset.bookId;
                    const bookName = event.target.dataset.bookName; // Get book name for filename
                    try {
                        // Updated API endpoint to Netlify Function
                        const response = await fetch(`${BASE_URL}/.netlify/functions/download-book/${bookId}?filename=${encodeURIComponent(bookName + '.pdf')}`, { // Pass filename for backend
                            method: 'GET',
                            headers: {
                                'x-auth-token': authToken
                            }
                        });

                        if (response.ok) {
                            const blob = await response.blob();
                            const downloadUrl = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = downloadUrl;
                            // Use the bookName dataset for filename, fallback to generic
                            a.download = bookName ? `${bookName}.pdf` : 'book.pdf';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(downloadUrl);
                            console.log('Book downloaded successfully!');
                        } else {
                            const errorData = await response.json();
                            console.error('Download failed:', errorData.message);
                            console.log(`Download failed: ${errorData.message}`); // Placeholder for custom modal
                        }
                    } catch (error) {
                        console.error('Error during download:', error);
                        console.log('An error occurred during download. Please try again.'); // Placeholder for custom modal
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
    function showAddBookModal() {
        if (!isLoggedIn) {
            console.log('You must be logged in to upload a book.'); // Placeholder for custom modal
            window.location.href = 'auth.html';
            return;
        }
        addBookModal.classList.remove('hidden');
    }

    // Attach listener to the button within the add-book-card if it exists
    if (addBookButton) {
        addBookButton.addEventListener('click', showAddBookModal);
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
                console.log('You must be logged in to upload a book.'); // Placeholder for custom modal
                window.location.href = 'auth.html';
                return;
            }

            const bookName = bookTitleInput.value.trim();
            const authorName = bookAuthorInput.value.trim();
            const genre = bookGenreInput.value.trim();
            const bookDescription = bookDescriptionInput ? bookDescriptionInput.value.trim() : '';
            const coverImageFile = coverImageFileInput.files[0];
            const pdfFile = pdfFileInput.files[0];

            if (!bookName || !authorName || !genre || !pdfFile) { // Description is optional
                console.log('Please fill in required fields (Book Name, Author, Genre, PDF File).'); // Placeholder for custom modal
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

            console.log('Attempting upload with token:', authToken); // Log token before upload
            try {
                // Updated API endpoint to Netlify Function
                const response = await fetch(`${BASE_URL}/.netlify/functions/upload-book`, { // Assuming an upload-book function
                    method: 'POST',
                    body: formData,
                    headers: {
                        'x-auth-token': authToken
                    }
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log('Book uploaded successfully response:', result);
                    console.log('Book added successfully!'); // Placeholder for custom modal
                    addBookModal.classList.add('hidden');
                    addBookForm.reset();
                    await fetchAndDisplayBooks(); // Re-fetch books to show the new one
                } else {
                    const errorData = await response.json();
                    console.error('Book upload failed:', errorData.message);
                    console.log(`Book upload failed: ${errorData.message}`); // Placeholder for custom modal
                }
            } catch (error) {
                console.error('Error during book upload:', error);
                console.log('An error occurred during book upload. Please try again.'); // Placeholder for custom modal
            }
        });
    }

    // --- Theme Toggle Functionality ---
    const themeToggle = document.getElementById('theme-toggle'); // Ensure this ID exists in your index.html
    const body = document.body;

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        body.classList.add(savedTheme);
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            if (body.classList.contains('dark-theme')) {
                body.classList.remove('dark-theme');
                localStorage.setItem('theme', '');
            } else {
                body.classList.add('dark-theme');
                localStorage.setItem('theme', 'dark-theme');
            }
        });
    }

    // --- Initial Load ---
    updateLoginUI();
    fetchAndDisplayBooks(); // Initial fetch of all books
});
