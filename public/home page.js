// home page.js - SIMPLIFIED VERSION: For a static website with no login/upload/download

// IMPORTANT: This BASE_URL should point to your live Netlify site.
// It's used to call your Netlify Functions (specifically, get-books).
const BASE_URL = 'https://merafe.netlify.app';

document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const searchInput = document.getElementById('home-search-input');
    const newReleasesContainer = document.getElementById('new-releases-books');

    // --- Theme Toggle Functionality (remains for consistent UI) ---
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

    // --- Fetch and Display Books ---
    async function fetchAndDisplayBooks(searchTerm = '') {
        try {
            // Call the Netlify Function to get books
            const response = await fetch(`${BASE_URL}/.netlify/functions/get-books`);
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

            // Clear existing books
            newReleasesContainer.innerHTML = ''; 

            if (filteredBooks.length === 0) {
                newReleasesContainer.innerHTML = '<p class="text-gray-600">No books found matching your criteria.</p>';
            }

            // Add dynamic book cards
            filteredBooks.forEach(book => {
                const bookCard = document.createElement('div');
                bookCard.className = 'flex flex-col gap-3 pb-3 h-full justify-between book-card'; 
                bookCard.innerHTML = `
                    <div class="flex w-full bg-center bg-no-repeat aspect-[3/4] bg-cover rounded-xl" 
                         style="background-image: url('${book.coverImageUrl || 'https://placehold.co/158x210/CCCCCC/000000?text=No+Cover'}');">
                    </div>
                    <p class="book-title text-[#141414] text-left text-base font-medium leading-normal">${book.bookName}</p>
                    <p class="text-gray-600 text-sm">by ${book.authorName}</p>
                    <p class="text-gray-500 text-xs">${book.genre}</p>
                    <p class="text-gray-700 text-sm flex-grow">${book.bookDescription}</p>
                    ${book.pdfDownloadUrl ? `
                        <a href="${book.pdfDownloadUrl}" target="_blank" download="${book.bookName || 'book'}.pdf"
                           class="download-button mt-2 w-full border border-[#141414] text-[#141414] py-1 px-2 rounded-md text-xs font-medium hover:bg-[#141414] hover:text-white transition-colors duration-200">
                            Download PDF
                        </a>` : ''}
                `;
                newReleasesContainer.appendChild(bookCard);
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

    // --- Initial Load ---
    fetchAndDisplayBooks(); // Initial fetch of all books
});
