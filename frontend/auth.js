// Configuration
const API_BASE_URL = 'http://localhost:8000/api/auth';

// Global state
let otpToken = '';
let tempTokens = null;
let userId = '';
let resetEmail = '';

// Utility Functions
function showError(elementId, message) {
    const errorDiv = document.getElementById(elementId);
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function hideAllPages() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('registerPage').style.display = 'none';
    document.getElementById('resetPasswordPage').style.display = 'none';
}

function showLogin() {
    hideAllPages();
    document.getElementById('loginPage').style.display = 'block';
}

function showRegister() {
    hideAllPages();
    document.getElementById('registerPage').style.display = 'block';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('otpForm').style.display = 'none';
}

function showResetPassword() {
    hideAllPages();
    document.getElementById('resetPasswordPage').style.display = 'block';
    document.getElementById('resetEmailForm').style.display = 'block';
    document.getElementById('resetOtpForm').style.display = 'none';
    document.getElementById('newPasswordForm').style.display = 'none';
}

// API Functions
async function apiCall(endpoint, method, data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    const token = localStorage.getItem('access_token');
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const responseData = await response.json();

    if (!response.ok) {
        throw responseData;
    }

    return responseData;
}

// Login Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const data = await apiCall('/login/', 'POST', { email, password });
        
        // Store tokens
        localStorage.setItem('access_token', data.tokens.access);
        localStorage.setItem('refresh_token', data.tokens.refresh);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        alert('Login successful!');
        
        // Redirect based on user type
        if (data.is_admin) {
            window.location.href = '/admin-dashboard.html';
        } else {
            window.location.href = '/chat.html';
        }
    } catch (error) {
        const errorMsg = error.non_field_errors?.[0] || 
                        error.email?.[0] || 
                        error.password?.[0] || 
                        'Login failed';
        showError('loginError', errorMsg);
    }
});

// Register Handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirm_password = document.getElementById('registerConfirmPassword').value;

    if (password !== confirm_password) {
        showError('registerError', 'Passwords do not match');
        return;
    }

    try {
        const data = await apiCall('/register/', 'POST', {
            email,
            password,
            confirm_password
        });

        otpToken = data.otp_token;
        tempTokens = data.tokens;

        // Show OTP form
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('otpForm').style.display = 'block';
        
        alert('Registration successful! Please verify OTP sent to your email.');
    } catch (error) {
        const errorMsg = error.email?.[0] || 
                        error.confirm_password || 
                        'Registration failed';
        showError('registerError', errorMsg);
    }
});

// OTP Verification Handler (Register)
document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const otp = document.getElementById('otpInput').value;

    try {
        await apiCall('/verify-otp/', 'POST', {
            otp_token: otpToken,
            otp: otp
        });

        alert('Account activated successfully!');
        
        // Store tokens
        localStorage.setItem('access_token', tempTokens.access);
        localStorage.setItem('refresh_token', tempTokens.refresh);
        
        showLogin();
    } catch (error) {
        const errorMsg = error.otp?.[0] || 'OTP verification failed';
        showError('registerError', errorMsg);
    }
});

// Reset Password - Email Submit
document.getElementById('resetEmailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    resetEmail = document.getElementById('resetEmail').value;

    try {
        const data = await apiCall('/reset-password/', 'POST', { email: resetEmail });
        
        otpToken = data.otp_token;
        userId = data.user_id;

        document.getElementById('resetEmailDisplay').textContent = resetEmail;
        document.getElementById('resetEmailForm').style.display = 'none';
        document.getElementById('resetOtpForm').style.display = 'block';
        
        alert('OTP sent to your email!');
    } catch (error) {
        const errorMsg = error.email?.[0] || 'Failed to send OTP';
        showError('resetError', errorMsg);
    }
});

// Reset Password - OTP Verification
document.getElementById('resetOtpForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const otp = document.getElementById('resetOtpInput').value;

    try {
        await apiCall('/verify-otp/', 'POST', {
            otp_token: otpToken,
            otp: otp
        });

        document.getElementById('resetOtpForm').style.display = 'none';
        document.getElementById('newPasswordForm').style.display = 'block';
        
        alert('OTP verified! Enter your new password.');
    } catch (error) {
        const errorMsg = error.otp?.[0] || 'Invalid OTP';
        showError('resetError', errorMsg);
    }
});

// Reset Password - New Password Submit
document.getElementById('newPasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    if (newPassword !== confirmNewPassword) {
        showError('resetError', 'Passwords do not match');
        return;
    }

    try {
        await apiCall('/new-password/', 'POST', {
            user_id: userId,
            new_password: newPassword,
            confirm_password: confirmNewPassword
        });

        alert('Password reset successful!');
        showLogin();
    } catch (error) {
        const errorMsg = error.confirm_password || 'Failed to reset password';
        showError('resetError', errorMsg);
    }
});

// Resend OTP Function
async function resendOTP(type) {
    try {
        await apiCall('/resend-otp/', 'POST', {
            otp_token: otpToken
        });
        
        alert('OTP resent successfully!');
    } catch (error) {
        alert('Failed to resend OTP');
    }
}

// Initialize - Show login page by default
window.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const token = localStorage.getItem('access_token');
    if (token) {
        window.location.href = '/chat.html';
    } else {
        showLogin();
    }
});