from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.mixins import AuditedMixin

from .models import User
from .serializers import LoginSerializer, UserSerializer


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = []
    authentication_classes = []


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        lang = request.data.get("language")
        if lang in ("en", "ur"):
            request.user.language = lang
            request.user.save(update_fields=["language"])
        return Response(UserSerializer(request.user).data)


class UserViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("role", "first_name", "username")
    serializer_class = UserSerializer
    role_map = {"doctors": ["receptionist", "doctor"], "*": []}

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get("role")
        if role:
            qs = qs.filter(role=role)
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q))
        return qs

    def perform_destroy(self, instance):
        # Never hard-delete staff that have history; deactivate instead.
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=False, methods=["get"])
    def doctors(self, request):
        today = timezone.localdate()
        docs = (
            User.objects.filter(role="doctor", is_active=True)
            .annotate(
                waiting=Count("visits", filter=Q(visits__visit_date=today, visits__status__in=["waiting", "with_doctor"]))
            )
            .order_by("first_name", "username")
        )
        data = [
            {
                "id": d.id,
                "full_name": d.display_name,
                "specialization": d.specialization,
                "consultation_fee": d.consultation_fee,
                "is_available": d.is_available,
                "waiting": d.waiting,
            }
            for d in docs
        ]
        return Response(data)
