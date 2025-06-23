// auth.js - FINAL: Corrected token handling, simplified messages, dynamic BASE_URL

// IMPORTANT: This BASE_URL should point to your live Netlify site.
// It is NOT the Render URL. Your Netlify Functions are on merafe.netlify.app.
const BASE_URL = 'https://merafe.netlify.app'; 

// You will need to make sure the Firebase client-side SDK is correctly
// initialized in your index.html or another script loaded before auth.js.
// Assuming 'auth' object from Firebase client SDK is globally available or imported.

document.addEventListener('DOMContentLoaded', async () => { // Added async here for consistency
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

    // --- Firebase Client SDK Initialization (for signInWithCustomToken) ---
    // This is crucial. If your Firebase client SDK is not initialized here or globally,
    // signInWithCustomToken will fail. Ensure you have the Firebase JS SDK loaded in your HTML
    // and correctly initialized before this script runs.
    // Example (should be in your HTML <head> or similar, for index.html and auth.html):
    // <script type="module">
    //   import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
    //   import { getAuth, signInWithCustomToken, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
    //   const firebaseConfig = {
    //     apiKey: "YOUR_FIREBASE_API_KEY", // This is your client-side API key
    //     authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
    //     projectId: "YOUR_FIREBASE_PROJECT_ID",
    //     storageBucket: "YOUR_FIREBASE_PROJECT_ID.appspot.com",
    //     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    //     appId: "YOUR_APP_ID"
    //   };
    //   const app = initializeApp(firebaseConfig);
    //   window.auth = getAuth(app); // Make auth globally accessible for auth.js
    // </script>

    // Assuming 'auth' is available globally (e.g., window.auth) from Firebase client SDK setup.
    // If not, you'd need to import and initialize Firebase client SDK here.
    const firebaseClientAuth = window.auth; 
    if (!firebaseClientAuth) {
        console.error("Firebase client-side Auth SDK not initialized. Please ensure it's set up in your HTML.");
        if (authMessage) authMessage.textContent = 'Auth system not ready. Please try again later.';
        return; // Prevent form submission if auth isn't ready
    }

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
            if (authMessage) authMessage.textContent = 'Please enter both email and password.';
            console.error('Please enter both email and password.');
            return;
        }

        let apiUrl = '';
        let payload = {};

        // Use the dynamic BASE_URL for API calls to your Netlify Functions
        if (isLoginMode) {
            apiUrl = `${BASE_URL}/.netlify/functions/login`; // Corrected path to Netlify Function
            payload = { email, password };
        } else {
            apiUrl = `${BASE_URL}/.netlify/functions/signup`; // Corrected path to Netlify Function
            if (!displayName) {
                if (authMessage) authMessage.textContent = 'Please enter a display name for signup.';
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
                    console.log('Login function returned custom token:', result.token); // Log the received custom token
                    
                    // CRITICAL STEP: Use Firebase client SDK to sign in with the custom token
                    const userCredential = await firebaseClientAuth.signInWithCustomToken(result.token);
                    const idToken = await userCredential.user.getIdToken(); // Get the Firebase ID Token
                    
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userId', userCredential.user.uid); // Use UID from client-side signed-in user
                    localStorage.setItem('userEmail', userCredential.user.email);
                    localStorage.setItem('userDisplayName', userCredential.user.displayName || displayName || 'User');
                    localStorage.setItem('authToken', idToken); // Store the actual Firebase ID Token

                    if (authMessage) authMessage.textContent = 'Login successful!';
                    console.log('Login successful. Stored ID Token:', idToken.substring(0, 20) + '...');
                    window.location.href = 'home page.html'; 
                } else { // If it was a signup attempt
                    // For signup, if successful, we just inform the user and switch to login mode.
                    // The actual user creation happens on the backend.
                    if (authMessage) authMessage.textContent = 'Account created successfully! Please log in.'; 
                    console.log('Sign Up successful:', result.message);
                    isLoginMode = true; // Automatically switch to login mode
                    updateUIMode(); // Update the UI to reflect login mode
                }

            } else { // Server response was NOT successful (e.g., 400, 401, 409)
                if (authMessage) authMessage.textContent = `Error: ${result.message || 'Something went wrong. Please try again.'}`;
                console.error(`${isLoginMode ? 'Login' : 'Sign Up'} failed:`, result.message);
            }
        } catch (error) { // Network or other unexpected errors
            if (authMessage) authMessage.textContent = 'Network or server error during authentication. Please check your connection.';
            console.error('Network or server error during authentication:', error);
            // Log full error object for detailed debugging if needed
            console.error('Full auth network error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        }
    });

    // Initialize UI mode on page load
    updateUIMode();
});
