# celery.py
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'chat.settings')

app = Celery('chat')
app.config_from_object('django.conf:settings', namespace='CELERY')


app.autodiscover_tasks()

from chatapp.tasks import force_offline_user, heartbeat_checker, cleanup_stale_connections

@app.task(bind=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
