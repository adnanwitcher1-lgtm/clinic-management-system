import gzip
import io
import shutil
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Create a compressed JSON backup of all clinic data (plus a pg_dump when PostgreSQL is used). Keeps the last 30."

    def handle(self, *args, **opts):
        out = Path(settings.BACKUP_DIR)
        out.mkdir(parents=True, exist_ok=True)
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M%S")
        buf = io.StringIO()
        call_command("dumpdata", exclude=["contenttypes", "auth.permission", "sessions", "admin.logentry"], indent=1, stdout=buf)
        target = out / f"clinic-{stamp}.json.gz"
        with gzip.open(target, "wt", encoding="utf-8") as fh:
            fh.write(buf.getvalue())
        self.stdout.write(self.style.SUCCESS(f"Backup written: {target}"))

        db = settings.DATABASES["default"]
        if "postgresql" in db["ENGINE"] and shutil.which("pg_dump"):
            dump = out / f"clinic-{stamp}.pgdump"
            env = {"PGPASSWORD": db.get("PASSWORD", ""), "PATH": "/usr/bin:/usr/local/bin"}
            res = subprocess.run(
                ["pg_dump", "-h", db["HOST"], "-p", str(db["PORT"]), "-U", db["USER"], "-Fc", "-f", str(dump), db["NAME"]],
                env=env, capture_output=True, text=True,
            )
            if res.returncode == 0:
                self.stdout.write(self.style.SUCCESS(f"pg_dump written: {dump}"))
            else:
                self.stdout.write(self.style.WARNING(f"pg_dump skipped: {res.stderr.strip()[:200]}"))

        for pattern in ("clinic-*.json.gz", "clinic-*.pgdump"):
            for old in sorted(out.glob(pattern), reverse=True)[30:]:
                old.unlink()
