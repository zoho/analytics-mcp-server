from fastapi.responses import JSONResponse
from src.config import Settings
Settings.HOSTED_LOCATION = Settings.CONSTANT_REMOTE_HOSTED_LOCATION
import src.tools # Do not remove this import, it is required to register the tools with the MCP server.
from src.mcp_instance import mcp
from fastapi import FastAPI, Request
import uvicorn
from src.auth.remote_auth import authRouter
from src.logging_util import configure_logging, get_logger
from src.auth.remote_auth import AuthMiddleware
from starlette.middleware.sessions import SessionMiddleware
# from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import asyncio
from contextlib import asynccontextmanager
from src.auth.persistence import InMemoryProvider, ttl_cleanup_task
from src.auth.remote_auth import registed_clients_store, auth_transactions_store, auth_codes_store, client_ip_vs_client_ids_store
from src.auth.rate_limiter import build_rate_limiter, _rate_limiter_cache, rate_limiter_cleanup_task, InMemoryTokenBucketRateLimiter
from src.utils.security import MaxBodySizeMiddleware
from fastapi.exceptions import RequestValidationError
from src.utils.exceptions import validation_exception_handler


configure_logging(
    level="INFO",              # overall minimum
    console_level="INFO",       # console: only INFO+
    file_level="INFO",         # file: capture everything
    log_file="app.log",
    max_bytes=5 * 1024 * 1024,  # 5 MB
    backup_count=3,
    library_levels={
        "docket": "WARNING",
        "mcp": "WARNING",
        "httpx": "WARNING",
    },
)

logger = get_logger(__name__)
# Uncomment below line to start the debugger
# import debugpy
# debugpy.listen(("0.0.0.0", 5678))

@asynccontextmanager
async def lifespan(app: FastAPI):

    background_tasks = []

    stores = [registed_clients_store, auth_transactions_store, auth_codes_store, client_ip_vs_client_ids_store]
    if any(isinstance(s, InMemoryProvider) for s in stores):
        for store in stores:
            background_tasks.append(asyncio.create_task(ttl_cleanup_task(store)))
        logger.info("Background TTL schedulers started for InMemoryProviders.")

    app.state.global_rate_limiter = await build_rate_limiter(capacity=Settings.GLOBAL_OAUTH_RATE_LIMIT_CAPACITY, window_seconds=Settings.GLOBAL_OAUTH_RATE_LIMIT_WINDOW)
    
    for limiter in _rate_limiter_cache.values():
        if isinstance(limiter, InMemoryTokenBucketRateLimiter):
            background_tasks.append(asyncio.create_task(rate_limiter_cleanup_task(limiter)))
    
    if background_tasks:
        logger.info(f"Started {len(background_tasks)} total background cleanup task(s).")

    async with mcp_server.lifespan(app):
        yield
    
    for task in background_tasks:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    
    logger.info(f"Successfully stopped {len(background_tasks)} background task(s).")



mcp_server = mcp.http_app(transport="streamable-http", path="/")

def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.mount("/static", StaticFiles(directory="src/static"), name="static")
    app.add_middleware(
        MaxBodySizeMiddleware,
        max_body_size=1 * 1024 * 1024,  # 1 MB
    )
    app.add_middleware(AuthMiddleware)


    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    app.add_middleware(SessionMiddleware, secret_key=Settings.SESSION_SECRET_KEY)
    app.include_router(authRouter, prefix="")
    app.mount("/mcp", mcp_server)
    return app


app = create_app()

# This is required for testing with inspector. Uncomment when needed.
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["http://localhost:6274"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )



def main():
    port = Settings.PORT
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__main__":
    main()