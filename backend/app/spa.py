from starlette.exceptions import HTTPException
from starlette.staticfiles import StaticFiles


class SpaFiles(StaticFiles):
    """Serves the built frontend. Unknown paths get index.html, but an unknown API path stays a 404."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            if e.status_code != 404 or path.replace("\\", "/").split("/")[0] == "api":
                raise
            return await super().get_response("index.html", scope)
