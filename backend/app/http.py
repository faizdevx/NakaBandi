import asyncio
import logging

import httpx

log = logging.getLogger("nakabandi.http")


class UpstreamError(Exception):
    """kind: auth | rate_limited | unavailable | bad_response. Never carries the URL (it may hold a key)."""

    def __init__(self, service: str, kind: str, status: int | None = None):
        super().__init__(f"{service}: {kind}" + (f" (HTTP {status})" if status else ""))
        self.service, self.kind, self.status = service, kind, status


async def request_json(client: httpx.AsyncClient, service: str, method: str, url: str, *, retries: int = 2, **kwargs):
    """Retries 429/5xx/network errors with backoff, honouring Retry-After."""
    status = None
    for attempt in range(retries + 1):
        delay = 0.5 * 2**attempt
        try:
            resp = await client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            log.warning("%s network error: %s", service, type(exc).__name__)
            status = None
        else:
            status = resp.status_code
            if status < 300:
                try:
                    return resp.json()
                except ValueError:
                    raise UpstreamError(service, "bad_response", status) from None
            if status in (401, 403):
                raise UpstreamError(service, "auth", status)
            if status != 429 and status < 500:
                raise UpstreamError(service, "bad_response", status)
            retry_after = resp.headers.get("retry-after", "")
            if retry_after.isdigit():
                delay = min(int(retry_after), 10)
            log.warning("%s HTTP %s, attempt %s", service, status, attempt + 1)
        if attempt < retries:
            await asyncio.sleep(delay)
    raise UpstreamError(service, "rate_limited" if status == 429 else "unavailable", status)
