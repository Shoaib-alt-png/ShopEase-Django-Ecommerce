
/* =====================================
   SHOPEASE SHOPPING CART
===================================== */

const CART_KEY = "cart";

// Get cart from browser storage
function getCart() {
    try {
        const cart = JSON.parse(
            localStorage.getItem(CART_KEY) || "[]"
        );

        return Array.isArray(cart) ? cart : [];
    } catch {
        return [];
    }
}

// Save cart
function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
}

// Update navbar cart count
function updateCartCount() {
    const countElement = document.getElementById("cart-count");

    if (countElement) {
        const totalItems = getCart().reduce(
            (sum, item) => sum + item.quantity,
            0
        );

        countElement.textContent = totalItems;
    }
}

// Format price
function formatPrice(price) {
    return Number(price).toFixed(2);
}


/* =====================================
   ADD PRODUCT TO CART
===================================== */

document.addEventListener("click", function(event) {

    const button = event.target.closest(".add-cart");

    if (!button) return;

    const id = Number(button.dataset.id);
    const name = button.dataset.name;
    const price = Number(button.dataset.price);
    const stock = Number(button.dataset.stock);

    if (!id || !name || !Number.isFinite(price) ||
        !Number.isInteger(stock) || stock <= 0) {

        alert("This product is currently unavailable.");
        return;
    }

    const cart = getCart();

    const existingProduct = cart.find(
        item => Number(item.id) === id
    );

    if (existingProduct) {

        if (existingProduct.quantity >= stock) {
            alert("Maximum available stock reached.");
            return;
        }

        existingProduct.quantity += 1;

    } else {

        cart.push({
            id: id,
            name: name,
            price: price,
            stock: stock,
            quantity: 1
        });

    }

    saveCart(cart);

    alert(name + " added to your cart!");

    renderCart();
});


/* =====================================
   DISPLAY CART PRODUCTS
===================================== */

function renderCart() {

    const cartContainer = document.getElementById("cart-items");

    if (!cartContainer) return;

    const cart = getCart();

    const totalElement = document.getElementById("cart-total");
    const checkoutLink = document.getElementById("checkout-link");

    cartContainer.replaceChildren();

    let total = 0;

    if (cart.length === 0) {

        const message = document.createElement("p");
        message.textContent = "Your shopping cart is empty.";

        cartContainer.appendChild(message);

        if (totalElement) {
            totalElement.textContent = "0.00";
        }

        if (checkoutLink) {
            checkoutLink.hidden = true;
        }

        return;
    }

    if (checkoutLink) {
        checkoutLink.hidden = false;
    }

    cart.forEach(item => {

        const subtotal = Number(item.price) * item.quantity;

        total += subtotal;

        const row = document.createElement("div");
        row.className = "cart-item";

        const name = document.createElement("h3");
        name.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = "Price: ₹" + formatPrice(item.price);

        const quantity = document.createElement("p");
        quantity.textContent = "Quantity: " + item.quantity;

        const subtotalText = document.createElement("p");
        subtotalText.textContent = "Subtotal: ₹" + formatPrice(subtotal);

        const decrease = document.createElement("button");
        decrease.textContent = "−";
        decrease.type = "button";
        decrease.dataset.cartAction = "decrease";
        decrease.dataset.id = item.id;

        const increase = document.createElement("button");
        increase.textContent = "+";
        increase.type = "button";
        increase.dataset.cartAction = "increase";
        increase.dataset.id = item.id;

        const remove = document.createElement("button");
        remove.textContent = "Remove";
        remove.type = "button";
        remove.dataset.cartAction = "remove";
        remove.dataset.id = item.id;

        row.append(
            name,
            price,
            quantity,
            subtotalText,
            decrease,
            increase,
            remove
        );

        cartContainer.appendChild(row);
    });

    if (totalElement) {
        totalElement.textContent = formatPrice(total);
    }
}


/* =====================================
   UPDATE OR REMOVE CART PRODUCTS
===================================== */

document.addEventListener("click", function(event) {

    const button = event.target.closest("[data-cart-action]");

    if (!button) return;

    const id = Number(button.dataset.id);
    const action = button.dataset.cartAction;

    const cart = getCart();

    const product = cart.find(
        item => Number(item.id) === id
    );

    if (!product) return;

    if (action === "increase") {

        if (product.quantity < product.stock) {
            product.quantity += 1;
        } else {
            alert("Maximum available stock reached.");
        }

    } else if (action === "decrease") {

        product.quantity -= 1;

        if (product.quantity <= 0) {
            const index = cart.indexOf(product);
            cart.splice(index, 1);
        }

    } else if (action === "remove") {

        const index = cart.indexOf(product);
        cart.splice(index, 1);

    }

    saveCart(cart);
    renderCart();
});


/* =====================================
   CHECKOUT TOTAL
===================================== */

function updateCheckoutTotal() {

    const totalElement = document.getElementById("checkout-total");

    if (!totalElement) return;

    const total = getCart().reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0
    );

    totalElement.textContent = formatPrice(total);
}


/* =====================================
   RAZORPAY PAYMENT
===================================== */

const paymentForm = document.getElementById("payment-form");

if (paymentForm) {

    updateCheckoutTotal();

    paymentForm.addEventListener("submit", async function(event) {

        event.preventDefault();

        const message = document.getElementById("payment-message");
        const cart = getCart();

        if (!cart.length) {
            message.textContent = "Your cart is empty.";
            return;
        }

        const formData = new FormData(paymentForm);

        const csrf = paymentForm.querySelector(
            '[name="csrfmiddlewaretoken"]'
        ).value;

        const button = paymentForm.querySelector("button");

        button.disabled = true;

        try {

            const response = await fetch("/create-payment/", {

                method: "POST",

                headers: {
                    "X-CSRFToken": csrf
                },

                body: new URLSearchParams({

                    cart_data: JSON.stringify(
                        cart.map(item => ({
                            id: item.id,
                            quantity: item.quantity
                        }))
                    ),

                    name: formData.get("name"),
                    email: formData.get("email"),
                    address: formData.get("address")

                })

            });

            const order = await response.json();

            if (!response.ok) {
                throw new Error(order.error || "Could not create order.");
            }

            if (typeof Razorpay === "undefined") {
                throw new Error("Razorpay checkout could not be loaded.");
            }

            const options = {

                key: order.key,

                amount: order.amount,

                currency: "INR",

                name: "ShopEase",

                description: "Shopping Payment",

                order_id: order.order_id,

                handler: async function(payment) {

                    try {

                        const verification = await fetch(
                            "/verify-payment/",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type": "application/json",
                                    "X-CSRFToken": csrf
                                },

                                body: JSON.stringify(payment)
                            }
                        );

                        const result = await verification.json();

                        if (!verification.ok || !result.success) {
                            throw new Error(
                                result.error || "Verification failed."
                            );
                        }

                        localStorage.removeItem(CART_KEY);

                        window.location.href = "/orders/";

                    } catch(error) {

                        message.textContent = error.message;
                        button.disabled = false;

                    }
                },

                modal: {
                    ondismiss: function() {
                        button.disabled = false;

                        message.textContent =
                            "Payment was not completed. You can try again.";
                    }
                },

                prefill: {
                    name: formData.get("name"),
                    email: formData.get("email")
                },

                theme: {
                    color: "#171c35"
                }

            };

            const razorpay = new Razorpay(options);

            razorpay.on("payment.failed", function() {

                button.disabled = false;

                message.textContent =
                    "Payment failed. Please try again.";

            });

            razorpay.open();

        } catch(error) {

            message.textContent = error.message;
            button.disabled = false;

        }

    });
}


/* =====================================
   INITIALIZE CART
===================================== */

document.addEventListener("DOMContentLoaded", function() {
    updateCartCount();
    renderCart();
    updateCheckoutTotal();

});
