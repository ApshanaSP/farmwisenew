"""See __init__.py: sync_playwright() always fails with Error, the type the collectors already catch."""


class Error(Exception):
    pass


def sync_playwright():
    raise Error("Playwright is not available on AWS Lambda (no Chromium); run this source on the PC and push it with aws/push.py")
