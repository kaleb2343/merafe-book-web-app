// auth.js - UPDATED: All API calls now use dynamic BASE_URL for Render

const BASE_URL = 'https://merafe-e-book.onrender.com'; // IMPORTANT: This is your live Render URL

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form'); // Assuming signupForm exists for now
    const messageDiv = document.getElementById('message');

    // Dark mode toggle functionality (copied from your original index.html concept)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        const currentTheme = localStorage.getItem('theme') || 'light';
        if (currentTheme === 'dark') {
            document.body.classList.add('dark-mode');
        }

        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const newTheme = document.body.classList.contains('dark-mode') ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            messageDiv.textContent = ''; // Clear previous messages

            const email = loginForm.email.value.trim(); // Assuming email for now
            const password = loginForm.password.value;

            // Basic client-side validation
            if (!email || !password) {
                messageDiv.textContent = 'Email and password are required.';
                messageDiv.className = 'text-red-500';
                return;
            }

            try {
                const response = await fetch(`${BASE_URL}/api/login`, { // Using BASE_URL here
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    messageDiv.textContent = data.message;
                    messageDiv.className = 'text-green-500';
                    // Store user info and token in localStorage
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', data.userId);
                    localStorage.setItem('userDisplayName', data.displayName);
                    localStorage.setItem('authToken', data.authToken);
                    // Redirect to home page after successful login
                    window.location.href = 'index.html';
                } else {
                    messageDiv.textContent = data.message;
                    messageDiv.className = 'text-red-500';
                }
            } catch (error) {
                console.error('Error during login:', error);
                messageDiv.textContent = 'Network error during login. Please try again.';
                messageDiv.className = 'text-red-500';
            }
        });
    }

    // Assuming signupForm exists and has similar structure
    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            messageDiv.textContent = ''; // Clear previous messages

            const displayName = signupForm.displayName.value.trim();
            const email = signupForm.email.value.trim(); // Assuming email for now
            const password = signupForm.password.value;

            // Basic client-side validation
            if (!displayName || !email || !password) {
                messageDiv.textContent = 'All fields are required.';
                messageDiv.className = 'text-red-500';
                return;
            }

            try {
                const response = await fetch(`${BASE_URL}/api/signup`, { // Using BASE_URL here
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ displayName, email, password })
                });

                const data = await response.json();
                if (response.ok) {
                    messageDiv.textContent = data.message;
                    messageDiv.className = 'text-green-500';
                    // Optionally, redirect to login page after successful signup
                    setTimeout(() => {
                        window.location.href = 'auth.html';
                    }, 2000);
                } else {
                    messageDiv.textContent = data.message;
                    messageDiv.className = 'text-red-500';
                }
            } catch (error) {
                console.error('Error during signup:', error);
                messageDiv.textContent = 'Network error during signup. Please try again.';
                messageDiv.className = 'text-red-500';
            }
        });
    }
});
