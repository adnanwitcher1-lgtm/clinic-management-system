import re


def digits(value):
    return re.sub(r"\D", "", value or "")


def dispatch(task, *args, **kwargs):
    """Queue a Celery task; if the broker is unreachable run it inline so the user never loses an action."""
    try:
        return task.apply_async(args=args, kwargs=kwargs, retry=False)
    except Exception:  # broker down / not configured
        return task.apply(args=args, kwargs=kwargs)
