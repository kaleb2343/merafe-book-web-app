// home page.js - UPDATED: All books are publicly visible, no user filtering on frontend fetch

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
            // Removed: fetchHeaders logic as we always want all books now
            const response = await fetch('http://localhost:3000/api/books');

            if (!response.ok) {
                console.error(`Failed to fetch books: HTTP error! status: ${response.status}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const books = await response.json();
            console.log('Fetched books successfully. Number of books:', books.length, 'Books:', books);

            if (books.length === 0) {
                console.log('No books returned from backend.');
            }

            books.forEach(book => {
                console.log('Rendering book:', book.bookName);
                const bookCard = document.createElement('div');
                bookCard.className = 'flex flex-col gap-3 pb-3 h-full justify-between book-card';
                bookCard.innerHTML = `
                    <div class="w-full bg-center bg-no-repeat aspect-[3/4] bg-cover rounded-xl" style='background-image: url("${book.coverImageUrl || 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover'}");'></div>
                    <p class="book-title text-[#141414] text-left text-base font-medium leading-normal">${book.bookName}</p>
                    <div class="book-details">
                        <p class="book-author">Author: ${book.authorName}</p>
                        <p class="book-genre">Genre: ${book.genre}</p>
                    </div>
                    ${authToken ? `
                    <button data-book-id="${book.id}" class="download-button mt-2 w-full border border-[#141414] text-[#141414] py-1 px-2 rounded-md text-xs font-medium hover:bg-[#141414] hover:text-white transition-colors duration-200 text-center">
                        Download
                    </button>
                    ` : `
                    <button class="mt-2 w-full border border-gray-300 text-gray-500 py-1 px-2 rounded-md text-xs font-medium cursor-not-allowed" disabled>
                        Login to Download
                    </button>
                    `}
                `;
                newReleasesContainer.appendChild(bookCard);
            });

            // Attach event listeners to all download buttons after they are added to the DOM
            document.querySelectorAll('.download-button').forEach(button => {
                button.addEventListener('click', async (event) => {
                    if (!authToken) {
                        console.warn('You must be logged in to download books. No auth token found.');
                        return;
                    }
                    const bookId = event.target.dataset.bookId;
                    try {
                        const downloadResponse = await fetch(`http://localhost:3000/download-book/${bookId}`, {
                            method: 'GET',
                            headers: {
                                'x-auth-token': authToken
                            }
                        });

                        if (downloadResponse.ok) {
                            const blob = await downloadResponse.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            const contentDisposition = downloadResponse.headers.get('Content-Disposition');
                            let filename = `book-${bookId}.pdf`;
                            if (contentDisposition) {
                                const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
                                if (filenameMatch && filenameMatch[1]) {
                                    filename = filenameMatch[1];
                                }
                            }
                            a.download = filename;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(url);
                            console.log(`Download for book ID ${bookId} initiated.`);
                        } else {
                            const errorText = await downloadResponse.text();
                            console.error(`Failed to download book ID ${bookId}:`, errorText);
                        }
                    } catch (error) {
                        console.error('Error during download request:', error);
                    }
                });
            });

        } catch (error) {
            console.error('Error during fetchAndDisplayBooks:', error);
            newReleasesContainer.innerHTML = '<p class="text-red-500">Failed to load books. Please ensure the server is running.</p>';
        }
    }

    // Call fetchAndDisplayBooks on page load
    fetchAndDisplayBooks();


    // --- Search functionality ---
    if (searchInput) {
        searchInput.addEventListener('keyup', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            let visibleBookCount = 0;

            const allBookCards = document.querySelectorAll('#new-releases-books .book-card:not(.add-book-card)');
            allBookCards.forEach(card => {
                const titleElement = card.querySelector('.book-title');
                const authorElement = card.querySelector('.book-author');
                const genreElement = card.querySelector('.book-genre');

                const bookTitle = titleElement ? titleElement.textContent.toLowerCase() : '';
                const bookAuthor = authorElement ? authorElement.textContent.toLowerCase() : '';
                const bookGenre = genreElement ? genreElement.textContent.toLowerCase() : '';

                if (bookTitle.includes(searchTerm) || bookAuthor.includes(searchTerm) || bookGenre.includes(searchTerm)) {
                    card.style.display = 'flex';
                    visibleBookCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            if (visibleBookCount === 1) {
                newReleasesContainer.classList.add('single-result');
            } else {
                newReleasesContainer.classList.remove('single-result');
            }
        });
    }

    // --- Add Book Modal Functionality ---
    if (addBookButton && addBookModal && closeModalButton && addBookForm) {
        addBookButton.addEventListener('click', () => {
            addBookModal.classList.remove('hidden');
        });

        closeModalButton.addEventListener('click', () => {
            addBookModal.classList.add('hidden');
            addBookForm.reset();
        });

        addBookModal.addEventListener('click', (event) => {
            if (event.target === addBookModal) {
                addBookModal.classList.add('hidden');
                addBookForm.reset();
            }
        });

        addBookForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!authToken) {
                console.error('You must be logged in to add a book. No auth token found.');
                return;
            }

            const bookName = bookTitleInput.value.trim();
            const authorName = bookAuthorInput.value.trim();
            const genre = bookGenreInput.value.trim();
            const coverImageFile = coverImageFileInput.files[0];
            const pdfFile = pdfFileInput.files[0];
            const bookDescription = bookDescriptionInput.value.trim();

            const genreWords = genre.split(/\s+/).filter(word => word.length > 0);
            if (genreWords.length > 4) {
                console.error('Genre can have a maximum of 4 words.');
                return;
            }

            if (coverImageFile) {
                const MAX_IMAGE_SIZE_MB = 5;
                const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

                if (coverImageFile.size > MAX_IMAGE_SIZE_BYTES) {
                    console.error(`Cover image size exceeds ${MAX_IMAGE_SIZE_MB}MB.`);
                    return;
                }
            }
            await uploadBookData();


            async function uploadBookData() {
                const formData = new FormData();
                formData.append('bookName', bookName);
                formData.append('authorName', authorName);
                formData.append('genre', genre);
                formData.append('bookDescription', bookDescription);

                if (coverImageFile) {
                    formData.append('coverImageFile', coverImageFile);
                }
                if (pdfFile) {
                    formData.append('pdfFile', pdfFile);
                }

                try {
                    const response = await fetch('http://localhost:3000/upload-book', {
                        method: 'POST',
                        body: formData,
                        headers: {
                            'x-auth-token': authToken
                        }
                    });

                    if (response.ok) {
                        const result = await response.json();
                        console.log('Book uploaded successfully response:', result);
                        console.log('Book added successfully (via backend)!');
                        addBookModal.classList.add('hidden');
                        addBookForm.reset();
                        console.log('Calling fetchAndDisplayBooks() after successful upload.');
                        await fetchAndDisplayBooks();
                    } else {
                        const errorData = await response.json();
                        console.error('Book upload failed:', errorData.message);
                    }
                } catch (error) {
                    console.error('Error during book upload:', error);
                }
            }
        });
    }
});
