
import json
import uuid
import razorpay

from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.shortcuts import (
    render,
    redirect,
    get_object_or_404
)
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth import login, logout
from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.decorators import login_required

from .forms import RegisterForm
from .models import Category, Product, Order, OrderItem


# ==========================================
# 1. HOME PAGE: PRODUCTS, SEARCH AND FILTERS
# ==========================================

def home(request):

    products = Product.objects.all()
    categories = Category.objects.all()

    search = request.GET.get('q', '').strip()
    category = request.GET.get('category', '').strip()
    max_price = request.GET.get('max_price', '').strip()

    if search:
        products = products.filter(
            Q(name__icontains=search) |
            Q(description__icontains=search)
        )

    if category:
        products = products.filter(
            category__slug=category
        )

    if max_price:
        try:
            price = Decimal(max_price)

            if price >= 0:
                products = products.filter(
                    price__lte=price
                )

        except (InvalidOperation, ValueError):
            pass

    return render(request, 'store/home.html', {
        'products': products,
        'categories': categories
    })


# ==========================================
# 2. PRODUCT DETAIL PAGE
# ==========================================

def product_detail(request, slug):

    product = get_object_or_404(
        Product,
        slug=slug
    )

    return render(request, 'store/product_detail.html', {
        'product': product
    })


# ==========================================
# 3. USER REGISTRATION
# ==========================================

def register_view(request):

    if request.method == "POST":

        form = RegisterForm(request.POST)

        if form.is_valid():

            user = form.save()

            login(request, user)

            return redirect("home")

    else:
        form = RegisterForm()

    return render(request, "store/register.html", {
        "form": form
    })


# ==========================================
# 4. USER LOGIN
# ==========================================

def login_view(request):

    if request.method == "POST":

        form = AuthenticationForm(
            request,
            data=request.POST
        )

        if form.is_valid():

            login(request, form.get_user())

            return redirect("home")

    else:
        form = AuthenticationForm(request)

    return render(request, "store/login.html", {
        "form": form
    })


# ==========================================
# 5. USER LOGOUT
# ==========================================

@login_required
def logout_view(request):

    if request.method == "POST":

        logout(request)

        return redirect("home")

    return redirect("home")


# ==========================================
# 6. SHOPPING CART PAGE
# ==========================================

def cart(request):

    return render(request, 'store/cart.html')


# ==========================================
# 7. CHECKOUT PAGE
# ==========================================

@login_required
def checkout(request):

    return render(request, 'store/checkout.html', {
        'razorpay_key_id': settings.RAZORPAY_KEY_ID
    })


# ==========================================
# 8. CUSTOMER ORDER HISTORY
# ==========================================

@login_required
def order_history(request):

    orders = Order.objects.filter(
        customer=request.user
    ).order_by('-created_at')

    return render(request, 'store/orders.html', {
        'orders': orders
    })


# ==========================================
# 9. RAZORPAY CLIENT
# ==========================================

def get_razorpay_client():

    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:

        raise ValueError(
            "Razorpay keys are not configured."
        )

    return razorpay.Client(
        auth=(
            settings.RAZORPAY_KEY_ID,
            settings.RAZORPAY_KEY_SECRET
        )
    )


# ==========================================
# 10. CREATE RAZORPAY PAYMENT
# ==========================================

@login_required
@require_POST
def create_payment(request):

    try:

        cart_data = json.loads(
            request.POST.get('cart_data', '[]')
        )

        customer_name = request.POST.get(
            'name', ''
        ).strip()

        email = request.POST.get(
            'email', ''
        ).strip()

        address = request.POST.get(
            'address', ''
        ).strip()

        if not customer_name or not email or not address:

            return JsonResponse({
                'error': 'Please provide your name, email and delivery address.'
            }, status=400)

        if not isinstance(cart_data, list) or not cart_data:

            return JsonResponse({
                'error': 'Your cart is empty.'
            }, status=400)

        quantities = {}

        for item in cart_data:

            if not isinstance(item, dict):
                raise ValueError()

            product_id = int(item['id'])
            quantity = int(item['quantity'])

            if product_id <= 0 or quantity <= 0:
                raise ValueError()

            quantities[product_id] = (
                quantities.get(product_id, 0) + quantity
            )

        products = Product.objects.filter(
            id__in=quantities.keys()
        )

        product_map = {
            product.id: product
            for product in products
        }

        if len(product_map) != len(quantities):

            return JsonResponse({
                'error': 'One or more products are unavailable.'
            }, status=400)

        total = Decimal('0.00')

        for product_id, quantity in quantities.items():

            product = product_map[product_id]

            if product.stock < quantity:

                return JsonResponse({
                    'error': f'Insufficient stock for {product.name}.'
                }, status=400)

            total += product.price * quantity

        if total <= 0:

            return JsonResponse({
                'error': 'Invalid order amount.'
            }, status=400)

        client = get_razorpay_client()

        payment_order = client.order.create({
            'amount': int(total * 100),
            'currency': 'INR',
            'receipt': f'order-{uuid.uuid4().hex[:20]}'
        })

        order = Order.objects.create(
            customer=request.user,
            customer_name=customer_name,
            email=email,
            address=address,
            total_price=total,
            razorpay_order_id=payment_order['id'],
            status='pending'
        )

        for product_id, quantity in quantities.items():

            product = product_map[product_id]

            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=quantity,
                price=product.price
            )

        return JsonResponse({

            'order_id': payment_order['id'],

            'amount': int(total * 100),

            'key': settings.RAZORPAY_KEY_ID,

            'database_order_id': order.id

        })

    except (
        ValueError,
        TypeError,
        KeyError,
        InvalidOperation,
        json.JSONDecodeError
    ):

        return JsonResponse({
            'error': 'Invalid cart data or customer information.'
        }, status=400)

    except Exception:

        return JsonResponse({
            'error': 'Unable to create payment. Please try again.'
        }, status=500)


# ==========================================
# 11. VERIFY RAZORPAY PAYMENT
# ==========================================

@login_required
@require_POST
def verify_payment(request):

    try:

        data = json.loads(request.body)

        razorpay_order_id = data['razorpay_order_id']

        razorpay_payment_id = data['razorpay_payment_id']

        razorpay_signature = data['razorpay_signature']

        order = Order.objects.get(
            customer=request.user,
            razorpay_order_id=razorpay_order_id
        )

        client = get_razorpay_client()

        # Verify Razorpay payment signature

        client.utility.verify_payment_signature({

            'razorpay_order_id': razorpay_order_id,

            'razorpay_payment_id': razorpay_payment_id,

            'razorpay_signature': razorpay_signature

        })

        # Update order and product stock safely

        with transaction.atomic():

            order = Order.objects.select_for_update().get(
                id=order.id
            )

            # Prevent duplicate stock deduction

            if order.status == 'paid':

                return JsonResponse({
                    'success': True,
                    'message': 'Payment already verified.'
                })

            items = list(
                order.items.select_related('product').all()
            )

            product_ids = [
                item.product_id for item in items
            ]

            products = Product.objects.select_for_update().filter(
                id__in=product_ids
            )

            product_map = {
                product.id: product
                for product in products
            }

            # Check stock before deducting

            for item in items:

                product = product_map.get(item.product_id)

                if product is None or product.stock < item.quantity:

                    return JsonResponse({
                        'error': 'Insufficient stock.'
                    }, status=400)

            # Deduct stock

            for item in items:

                product = product_map[item.product_id]

                product.stock -= item.quantity

                product.save(
                    update_fields=['stock']
                )

            # Update payment information

            order.razorpay_payment_id = razorpay_payment_id

            order.status = 'paid'

            order.save(update_fields=[
                'razorpay_payment_id',
                'status'
            ])

        return JsonResponse({
            'success': True,
            'message': 'Payment successful.'
        })

    except Exception:

        return JsonResponse({
            'error': 'Payment verification failed.'
        }, status=400)
