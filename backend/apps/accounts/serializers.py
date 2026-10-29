from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from apps.audit.utils import log

from .models import User


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=6)
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "first_name", "last_name", "full_name", "email", "role", "phone",
            "specialization", "qualification", "consultation_fee", "counselling_fee", "language", "is_available",
            "is_active", "password",
        ]

    def get_full_name(self, obj):
        return obj.display_name

    def create(self, validated_data):
        password = validated_data.pop("password", None) or "changeme123"
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        log(self.context.get("request"), "login", user=self.user, model="User", object_id=self.user.pk, object_repr=str(self.user))
        return data
