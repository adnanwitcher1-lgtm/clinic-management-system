from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("clinic", "0003_phone_optional_injections")]

    operations = [
        migrations.AddField(
            model_name="visit",
            name="visit_type",
            field=models.CharField(choices=[("checkup", "Check-up"), ("counselling", "Counselling")], db_index=True, default="checkup", max_length=20),
        ),
    ]
