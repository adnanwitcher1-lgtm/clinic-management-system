from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="counselling_fee",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Fee for a counselling-only session (falls back to the consultation fee when empty)", max_digits=10, null=True),
        ),
        migrations.AlterField(
            model_name="user",
            name="consultation_fee",
            field=models.DecimalField(blank=True, decimal_places=2, help_text="Fee for a normal check-up visit", max_digits=10, null=True),
        ),
    ]
