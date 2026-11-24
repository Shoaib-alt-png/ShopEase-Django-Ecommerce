
from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),

    path('product/<slug:slug>/', views.product_detail, name='product_detail'),

    path('cart/', views.cart, name='cart'),

    path('checkout/', views.checkout, name='checkout'),

    path('register/', views.register_view, name='register'),

    path('login/', views.login_view, name='login'),

    path('logout/', views.logout_view, name='logout'),

    path('orders/', views.order_history, name='orders'),

    path('create-payment/', views.create_payment, name='create_payment'),

    path('verify-payment/', views.verify_payment, name='verify_payment'),
]
