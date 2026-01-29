from rest_framework import serializers
from django.contrib.auth import authenticate
from .models import CustomUser
import random
from django.utils import timezone
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings
import secrets

class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = CustomUser
        fields = ['email', 'password', 'confirm_password']


    def validate_email(self, value):
        if CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email already registered")
        return value

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match"})
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        user = CustomUser.objects.create_user(
            **validated_data,
            is_active=False
        )
        return user

class UserLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        email = data.get('email')
        password = data.get('password')

        if email and password:
            user = authenticate(email=email, password=password)
            if not user:
                raise serializers.ValidationError('Invalid email or password')
            if not user.is_active:
                raise serializers.ValidationError('User account is not active')
            user.save()
            return user
        raise serializers.ValidationError('Must include "email" and "password"')


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = [
            'id', 'email', 'first_name', 'last_name', 'is_active', 
            'is_staff',  # ← ADDED THIS FIELD
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_staff', 'created_at', 'updated_at']  # ← Made is_staff read-only


class OTPSerializer(serializers.Serializer):
    otp_token = serializers.CharField() 
    otp = serializers.CharField()

    def validate(self, data):
        otp_token = data['otp_token']
        otp_input = data['otp']

        cache_key = f"otp_flow:{otp_token}"
        cached_data = cache.get(cache_key)

        if not cached_data:
            raise serializers.ValidationError("OTP expired or not found")

        if cached_data['otp'] != otp_input:
            raise serializers.ValidationError("Invalid OTP")
        cache.delete(cache_key)
        data['verified'] = True
        data['user_id'] = cached_data['user_id']
        data['otp_type'] = cached_data['otp_type']
        return data

class ResetPasswordRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        user = CustomUser.objects.filter(email=value).first()
        if not user:
            raise serializers.ValidationError("Requested user email not found.")
        otp = str(random.randint(100000, 999999))

        
        flow_key = secrets.token_urlsafe(16)
        cache.set(
            f"otp_flow:{flow_key}",
            {
                "user_id": user.id,
                "otp_type": "reset_password",
                "otp": otp,
                "created_at": timezone.now().isoformat()
            },
            timeout=300
        )

        send_mail(
            'Reset Password OTP',
            f'Your OTP code is {otp}',
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False
        )
        self.user_id = user.id
        self.flow_key = flow_key
        return value


class ResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField()
    confirm_password = serializers.CharField()

    def validate(self, data):
        pass1 = data.get('new_password')
        pass2 = data.get('confirm_password')

        if pass1 != pass2:
            raise serializers.ValidationError("Password fields must match.")

        return data