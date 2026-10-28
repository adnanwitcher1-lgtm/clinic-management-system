from django.db import migrations, models


def rename_clinic(apps, schema_editor):
    """Existing installs: switch the stored clinic name from the old default to Al-Rehman Clinic."""
    ClinicSettings = apps.get_model("core", "ClinicSettings")
    ClinicSettings.objects.filter(clinic_name__in=["FitLife Clinic", ""]).update(clinic_name="Al-Rehman Clinic")
    ClinicSettings.objects.filter(email="info@fitlifeclinic.pk").update(email="info@alrehmanclinic.pk")


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="clinicsettings",
            name="clinic_name",
            field=models.CharField(default="Al-Rehman Clinic", max_length=150),
        ),
        migrations.RunPython(rename_clinic, migrations.RunPython.noop),
    ]
