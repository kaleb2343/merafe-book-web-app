// auth.js - UPDATED: Simplified success and failure messages and dynamic BASE_URL

// IMPORTANT: This is now set to your live Render URL.
const BASE_URL = 'https://merafe-e-book.onrender.com'; // Your live Render URL

document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const authModeTitle = document.getElementById('auth-mode-title');
    const authButton = document.getElementById('auth-button');
    const toggleAuthModeButton = document.getElementById('toggle-auth-mode');
    const displayNameField = document.getElementById('display-name-field');
    const emailInput = document.getElementById('auth-email');
    const passwordInput = document.getElementById('auth-password');
    const displayNameInput = document.getElementById('auth-display-name');
    const authMessage = document.getElementById('auth-message'); // Element to display messages

    let isLoginMode = true; // State to track if we are in login or signup mode

    // --- Theme Toggle Functionality (unchanged) ---
    const themeToggle = document.getElementById('theme-toggle');
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

    // --- Function to update UI based on mode (login/signup) ---
    function updateUIMode() {
        if (authMessage) authMessage.textContent = ''; // Clear previous messages
        if (isLoginMode) {
            authModeTitle.textContent = 'Login';
            authButton.textContent = 'Login';
            toggleAuthModeButton.textContent = 'No account? Sign up';
            displayNameField.classList.add('hidden'); // Hide display name for login
            displayNameInput.removeAttribute('required');
        } else {
            authModeTitle.textContent = 'Sign Up';
            authButton.textContent = 'Sign Up';
            toggleAuthModeButton.textContent = 'Already have an account? Login';
            displayNameField.classList.remove('hidden'); // Show display name for signup
            displayNameInput.setAttribute('required', 'true');
        }
    }

    // --- Toggle between login and signup modes ---
    toggleAuthModeButton.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        updateUIMode();
    });

    // --- Handle form submission (Login/Signup) ---
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        const displayName = displayNameInput.value.trim();

        if (!email || !password) {
            if (authMessage) authMessage.textContent = 'Not successful. Please try again.';
            console.error('Please enter both email and password.');
            return;
        }

        let apiUrl = '';
        let payload = {};

        // Use the dynamic BASE_URL for API calls
        if (isLoginMode) {
            apiUrl = `${BASE_URL}/api/login`;
            payload = { email, password };
        } else {
            apiUrl = `${BASE_URL}/api/signup`;
            if (!displayName) {
                if (authMessage) authMessage.textContent = 'Not successful. Please try again.';
                console.error('Please enter a display name for signup.');
                return;
            }
            payload = { email, password, displayName };
        }

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (response.ok) { // Server response was successful (200 OK, 201 Created)
                if (isLoginMode) { // If it was a login attempt
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', result.userId);
                    localStorage.setItem('userEmail', email);
                    localStorage.setItem('userDisplayName', result.displayName || displayName);
                    localStorage.setItem('authToken', result.authToken); // Store the session token

                    if (authMessage) authMessage.textContent = 'Login successful!'; // Simplified success message
                    console.log('Login successful:', result.message);
                    window.location.href = 'index.html'; // ONLY REDIRECT HERE (AFTER LOGIN)
                } else { // If it was a signup attempt
                    if (authMessage) authMessage.textContent = 'Account created successfully!'; // Simplified success message
                    console.log('Sign Up successful:', result.message);
                    // IMPORTANT: We do NOT redirect after signup. User must explicitly click login.
                    isLoginMode = true; // Automatically switch to login mode for the next action
                    updateUIMode(); // Update the UI to reflect login mode
                }

            } else { // Server response was NOT successful (e.g., 400, 401, 409)
                if (authMessage) authMessage.textContent = 'Not successful. Please try again.'; // Simplified generic error
                console.error(`${isLoginMode ? 'Login' : 'Sign Up'} failed:`, result.message);
                // Removed specific error message suggestion for user not found, as per request for generic message
            }
        } catch (error) { // Network or other unexpected errors
            if (authMessage) authMessage.textContent = 'Not successful. Please try again.'; // Simplified network error
            console.error('Network or server error during authentication:', error);
        }
    });

    // Initialize UI mode on page load
    updateUIMode();
});
