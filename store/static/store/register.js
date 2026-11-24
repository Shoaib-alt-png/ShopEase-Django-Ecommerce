
/* ================================
   ShopEase Registration JavaScript
================================ */

// Show and hide password
function togglePassword(fieldId, button) {

    const passwordField = document.getElementById(fieldId);

    if (!passwordField) return;

    if (passwordField.type === "password") {
        passwordField.type = "text";
        button.textContent = "Hide";
    } else {
        passwordField.type = "password";
        button.textContent = "Show";
    }
}


// Registration Form Validation
document.addEventListener("DOMContentLoaded", function () {

    const password1 = document.getElementById("id_password1");
    const password2 = document.getElementById("id_password2");

    const form = document.querySelector(".form-box form");

    if (!password1 || !password2 || !form) {
        return;
    }

    // Check password confirmation while typing
    function checkPasswords() {

        if (password2.value === "") {
            password2.setCustomValidity("");
            return;
        }

        if (password1.value !== password2.value) {
            password2.setCustomValidity("Passwords do not match.");
        } else {
            password2.setCustomValidity("");
        }
    }

    password1.addEventListener("input", checkPasswords);
    password2.addEventListener("input", checkPasswords);

    // Validate before submitting
    form.addEventListener("submit", function (event) {

        checkPasswords();

        if (!form.checkValidity()) {
            event.preventDefault();
            form.reportValidity();
        }

    });

});
