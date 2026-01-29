from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from datetime import timedelta
from .models import CustomUser
from rest_framework.permissions import IsAuthenticated
import random, secrets
from django.core.mail import send_mail
from django.conf import settings
from django.core.cache import cache
from .serializers import (
    UserSerializer, 
    UserLoginSerializer, 
    UserRegistrationSerializer, 
    ResetPasswordRequestSerializer,
    OTPSerializer,
    ResetPasswordSerializer
)


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }



class UserRegistrationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        otp = str(random.randint(100000, 999999))

        flow_key = secrets.token_urlsafe(16)
        cache.set(
            f"otp_flow:{flow_key}",
            {
                "user_id": user.id,
                "otp_type": "register",
                "otp": otp,
                "created_at": timezone.now().isoformat(),
            },
            timeout=300 
        )

        send_mail(
            subject='Registration Confirmation OTP',
            message=f'Your OTP code is {otp}',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False
        )

        tokens = get_tokens_for_user(user)

        return Response({
            'user': UserSerializer(user).data,
            'tokens': tokens,
            'otp_token':flow_key,
            'is_admin': user.is_staff,
            'message': 'User registered successfully. OTP sent to email.'
        }, status=status.HTTP_201_CREATED)


class UserLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data
        
        tokens = get_tokens_for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'tokens': tokens,
            'is_admin': user.is_staff,
            'message': 'Login successful'
        }, status=status.HTTP_200_OK)


class UserLogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response(
                {'message': 'Successfully logged out'}, 
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'error': 'Invalid token'}, 
                status=status.HTTP_400_BAD_REQUEST
            )


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        serializer = UserSerializer(user)
        response_data = serializer.data            
        return Response(response_data, status=status.HTTP_200_OK)

    def put(self, request):
        user = request.user
        payment_method = request.data.get('payment_method')
        if payment_method:
            valid_methods = [choice[0] for choice in CustomUser.PAYMENT_METHOD]
            if payment_method not in valid_methods:
                return Response({
                    'error': f'Invalid payment method. Choose from: {", ".join(valid_methods)}'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        serializer = UserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            'user': serializer.data,
            'message': 'Profile updated successfully'
        }, status=status.HTTP_200_OK)

class OTPVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        otp_type = serializer.validated_data['otp_type']
        user_id = serializer.validated_data['user_id']

        if otp_type == 'register':
            user = CustomUser.objects.get(id=user_id)
            user.is_active = True
            user.save()
            return Response({"detail": "Registration confirmed. Account activated."}, status=202)
        elif otp_type == 'reset_password':
            return Response({"detail": "OTP verified. You can now reset your password."}, status=202)


class ResetPasswordRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response({
            "otp_token":serializer.flow_key,
            "detail": "Reset password OTP sent to your email.",
            "user_id": serializer.user_id
        }, status=status.HTTP_200_OK)

class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user_id = request.data.get('user_id')
        new_password = serializer.validated_data['new_password']

        user = CustomUser.objects.get(id=user_id)
        user.set_password(new_password)
        user.save()

        return Response({"detail": "Password reset successful."}, status=status.HTTP_200_OK)


class ResendOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        otp_token = request.data.get("otp_token")
        if not otp_token:
            return Response(
                {"error": "OTP token is required"},
                status=400
            )
        flow_key = f"otp_flow:{otp_token}"
        flow_data = cache.get(flow_key)
        if not flow_data:
            return Response(
                {"error": "OTP session expired or invalid"},
                status=400
            )
        user_id = flow_data.get("user_id")
        otp_type = flow_data.get("otp_type")
        if otp_type not in ["register", "reset_password"]:
            return Response(
                {"error": "Invalid OTP flow"},
                status=400
            )
        try:
            user = CustomUser.objects.get(id=user_id)
        except CustomUser.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=404
            )
        cache.delete(flow_key)

        otp = str(random.randint(100000, 999999))

        cache.set(
            flow_key,
            {
                "user_id": user.id,
                "otp_type": otp_type,
                "otp": otp,
                "created_at": timezone.now().isoformat()
            },
            timeout=300
        )


        send_mail(
            subject="Your OTP Code",
            message=f"Your OTP code is {otp}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )

        return Response(
            {"detail": f"{otp_type.replace('_', ' ').title()} OTP resent successfully"},
            status=200
        )