from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import LoginView, MeView, UserViewSet
from apps.audit.views import AuditLogViewSet
from apps.billing.views import ClosingView, PaymentViewSet
from apps.clinic.views import AppointmentViewSet, InjectionTemplateViewSet, PatientViewSet, PrescriptionViewSet, SymptomViewSet, VisitViewSet
from apps.pharmacy.views import MedicineViewSet, UniversalMedicineViewSet
from apps.reports.views import DashboardView, ExportView, RecordsView

from .views import BackupView, GlobalSearchView, SettingsView

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("patients", PatientViewSet, basename="patient")
router.register("symptoms", SymptomViewSet, basename="symptom")
router.register("visits", VisitViewSet, basename="visit")
router.register("prescriptions", PrescriptionViewSet, basename="prescription")
router.register("medicines", MedicineViewSet, basename="medicine")
router.register("universal-medicines", UniversalMedicineViewSet, basename="universal-medicine")
router.register("payments", PaymentViewSet, basename="payment")
router.register("injection-templates", InjectionTemplateViewSet, basename="injection-template")
router.register("appointments", AppointmentViewSet, basename="appointment")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = [
    path("auth/login/", LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/me/", MeView.as_view()),
    path("settings/", SettingsView.as_view()),
    path("search/", GlobalSearchView.as_view()),
    path("backups/", BackupView.as_view()),
    path("billing/closing/", ClosingView.as_view()),
    path("reports/dashboard/", DashboardView.as_view()),
    path("reports/records/", RecordsView.as_view()),
    path("reports/export/", ExportView.as_view()),
] + router.urls
