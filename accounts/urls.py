from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='register'),
    path('verify-otp/', views.VerifyOTPView.as_view(), name='verify-otp'),
    path('resend-otp/', views.ResendOTPView.as_view(), name='resend-otp'),
    path('login/', views.LoginView.as_view(), name='login'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('profile/', views.ProfileView.as_view(), name='profile'),
    path('change-password/', views.ChangePasswordView.as_view(), name='change-password'),
    path('forgot-password/', views.ForgotPasswordView.as_view(), name='forgot-password'),
    path('verify-reset-code/', views.VerifyResetCodeSimpleView.as_view(), name='verify-reset-code'),
    path('reset-password/', views.ResetPasswordSimpleView.as_view(), name='reset-password'),
    path('fcm-token/', views.UpdateFCMTokenView.as_view(), name='fcm-token'),
                                                      
    path('send-otp/', views.SendOTPEmailView.as_view(), name='send-otp'),
    path('send-reset-code/', views.SendResetCodeView.as_view(), name='send-reset-code'),
    path('verify-reset-code-simple/', views.VerifyResetCodeSimpleView.as_view(), name='verify-reset-code-simple'),
    path('reset-password-simple/', views.ResetPasswordSimpleView.as_view(), name='reset-password-simple'),
]
