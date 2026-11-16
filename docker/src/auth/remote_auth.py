"""
===========================================================================
OAUTH PROXY: DYNAMIC CLIENT REGISTRATION (DCR) MIMICRY IMPLEMENTATION
===========================================================================

### Requirement ###
-------------------------------
1.  Provider Constraint: The upstream OAuth provider, Zoho ACCOUNTS, supports 
    Static Client Registration only. It does not offer the necessary endpoints 
    or functionality for Dynamic Client Registration (DCR).

2.  Client Dependency: Model Context Protocol (MCP) Hosts (e.g., Cursor, Claude Desktop) 
    are designed to rely exclusively on DCR for seamless user onboarding and client setup.

This fundamental incompatibility necessitates an intermediate service.

### Solution and Mechanism ###
-----------------------------
This OAuth Proxy module is implemented to bridge the DCR requirement of the MCP clients 
with the static limitations of the Zoho Accounts provider.

1.  Pre-registration: A single client ID and Secret were acquired via a manual 
    Static Registration process with the upstream Zoho Accounts provider. This static 
    client serves as the credential pool for all users.

2.  DCR Interception: The proxy intercepts all client requests made to the DCR endpoint 
    (typically `/register`).

3.  Credential Masquerading: Instead of forwarding the registration request upstream (which would fail), 
    the proxy immediately returns a successful DCR response with generated credentials
    while it uses the pre-registered credentials for the acutal operations.
"""


from fastapi import Request, status, HTTPException, Query, Form, APIRouter, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from src.config import Settings, get_analytics_client_instance
from urllib.parse import urljoin, urlencode, urlparse, urlunparse, parse_qsl, urlunsplit
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_401_UNAUTHORIZED
import secrets
from pydantic import BaseModel, AnyUrl, Field, RootModel, field_validator, ConfigDict
from typing import Literal, Optional, Dict, List
from datetime import datetime, timedelta, timezone, UTC
import uuid
from html import escape 
import httpx
from src.logging_util import get_logger
import asyncio
from fastapi.responses import FileResponse
import base64, hashlib, hmac, re
from src.auth.persistence import PersistenceFactory
from fastapi.templating import Jinja2Templates
from src.auth.rate_limiter import (
    RateLimiter,
    get_client_ip,
    scenario_registration_rate_limit,
    scenario_standard_rate_limit,
)


logger = get_logger(__name__)

authRouter = APIRouter()


UNAUTHENTICATED_PATHS = {
    "/register",
    "/authorize",
    "/consent",
    "/consent/approve",
    "/consent/deny",
    "/auth/callback",
    "/token",
    "/favicon.ico",
    "/",
}


UNAUTHENTICATED_PREFIXES = (
    "/.well-known/",
    "/static/"
)

ALLOWED_GRANT_TYPES = {"authorization_code", "refresh_token"}
ALLOWED_RESPONSE_TYPES = {"code"}


class DynamicClientRegistrationRequest(BaseModel):

    model_config = ConfigDict(extra="ignore")
    
    redirect_uris: Optional[List[str]] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_REDIRECT_URIS
    )

    client_name: Optional[str] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_CLIENT_NAME_LENGTH
    )

    scope: Optional[str] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_SCOPE_LENGTH
    )

    grant_types: Optional[List[str]] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_GRANT_TYPES
    )

    response_types: Optional[List[str]] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_RESPONSE_TYPES
    )

    secret: Optional[str] = Field(
        default=None,
        max_length=Settings.OAUTH_MAX_STRING_LENGTH
    )

    @field_validator("redirect_uris", mode="before")
    @classmethod
    def validate_redirect_uris(cls, v):
        if v is None:
            return v
        if len(v) > Settings.OAUTH_MAX_REDIRECT_URIS:
            raise ValueError(f"Maximum {Settings.OAUTH_MAX_REDIRECT_URIS} redirect_uris allowed")
        for uri in v:
            if len(uri) > Settings.OAUTH_MAX_STRING_LENGTH:
                raise ValueError("redirect_uri exceeds max length")
        return v

    @field_validator("grant_types", mode="before")
    @classmethod
    def validate_grant_types(cls, v):
        if v is None:
            return v
        if len(v) > Settings.OAUTH_MAX_GRANT_TYPES:
            raise ValueError(f"Maximum {Settings.OAUTH_MAX_GRANT_TYPES} grant_types allowed")
        for item in v:
            if len(item) > Settings.OAUTH_MAX_STRING_LENGTH:
                raise ValueError("grant_type exceeds max length")
        return v

    @field_validator("response_types", mode="before")
    @classmethod
    def validate_response_types(cls, v):
        if v is None:
            return v
        if len(v) > Settings.OAUTH_MAX_RESPONSE_TYPES:
            raise ValueError(f"Maximum {Settings.OAUTH_MAX_RESPONSE_TYPES} response_types allowed")
        for item in v:
            if len(item) > Settings.OAUTH_MAX_STRING_LENGTH:
                raise ValueError("response_type exceeds max length")
        return v


    @field_validator("grant_types")
    def check_grant_types(cls, v):
        if v:
            invalid = set(v) - ALLOWED_GRANT_TYPES
            if invalid:
                raise ValueError(f"Invalid grant_types: {invalid}")
        return v
    

    @field_validator("response_types")
    @classmethod
    def check_response_types(cls, v):
        if v:
            invalid = set(v) - ALLOWED_RESPONSE_TYPES
            if invalid:
                raise ValueError(f"Invalid response_types: {invalid}")
        return v



class AuthorizationTransaction(BaseModel):
    created_at: datetime
    expires_at: datetime
    client_id: str
    redirect_uri: AnyUrl
    scope: str
    state: Optional[str] = None
    code_challenge: Optional[str] = None
    code_challenge_method: Optional[str] = None
    approved: bool = False
    approval_nonce: Optional[str] = None


class AuthorizationCode(BaseModel):
    created_at: datetime
    expires_at: datetime
    transaction_id: str
    client_id: str
    redirect_uri: AnyUrl
    code_challenge: Optional[str] = None
    code_challenge_method: Optional[str] = None
    upstream_location: str
    upstream_code: str

class StringList(RootModel[list[str]]):
    root: list[str]


# REGISTERED_CLIENTS acts as an in-memory registry for all dynamically
# “created” OAuth clients. Since the upstream Zoho Accounts provider
# supports only Static Client Registration, the proxy must locally
# simulate Dynamic Client Registration (DCR).  
#
# When an MCP client sends a DCR request to `/register`, the proxy:
#   1. Generates a synthetic client_id and client_secret.
#   2. Stores the client’s metadata (redirect URIs, scopes, grant types,
#      response types, and the generated secret) in this dictionary.
#
# The key is the generated client_id (UUID4), and the value is an
# instance of DynamicClientRegistrationRequest containing the client’s
# configuration.  
type client_id_type = str
type transaction_id_type = str
type code_type = str

# REGISTERED_CLIENTS: dict[client_id_type, DynamicClientRegistrationRequest] = {}
# AUTH_TRANSACTIONS: dict[transaction_id_type, AuthorizationTransaction] = {}
# AUTHORIZATION_CODES: dict[code_type, AuthorizationCode] = {}

"""
Any store added here should also be added to the `stores` list in server lifespan events to ensure proper cleanup.
"""
registed_clients_store = PersistenceFactory.create(DynamicClientRegistrationRequest, scope="rc")
auth_transactions_store = PersistenceFactory.create(AuthorizationTransaction, scope="at")
auth_codes_store = PersistenceFactory.create(AuthorizationCode, scope="ac")
client_ip_vs_client_ids_store = PersistenceFactory.create(StringList, scope="ci")


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to handle Bearer Token authentication for protected API routes.

    It bypasses authentication for specific public paths and well-known endpoints.
    For protected routes, it validates the Authorization header and attempts to
    validate the token by making an external call.

    Raises:
        HTTPException: 401 Unauthorized if the token is missing, invalid, or expired.
    """


    def _unauthorized_response(self, detail: str, error: str = "unauthorized") -> JSONResponse:
        """Constructs the standardized 401 Unauthorized JSON response."""
        try:
            base = Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/"
        except NameError:
            base = "/" 
            
        return JSONResponse(
            status_code=HTTP_401_UNAUTHORIZED,
            content={"error": error, "error_description": detail},
            headers={
                "WWW-Authenticate": 
                    f'Bearer realm="OAuth", resource_metadata="{urljoin(base, ".well-known/oauth-protected-resource")}"'
            }
        )

    
    async def dispatch(self, request: Request, call_next):

        rate_limiter: RateLimiter = request.app.state.global_rate_limiter
        client_ip = get_client_ip(request)
        if not client_ip:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content="Unable to determine client IP for rate limiting.",
            )
        if await rate_limiter.allow(client_ip) is False:
            """
            Apart from the endpoint specific rate limiting, 
            we also want to have a global rate limiter to prevent overall abuse.
            Hence, using the global_rate_limiter for all requests regardless of the endpoint.
            """
            logger.warning(f"Rate limit exceeded for IP: {client_ip}")
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content="Rate limit exceeded. Try again later.",
            )


        path = request.url.path
        if path in UNAUTHENTICATED_PATHS or path.startswith(UNAUTHENTICATED_PREFIXES):
            logger.debug(f"Bypassing authentication for path: {path}")
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header:
            logger.warning(f"Missing Authorization header for path: {path}")
            return self._unauthorized_response("Missing Authorization header")

        try:
            scheme, token = auth_header.split()
            if scheme.lower() != "bearer":
                logger.warning(f"Invalid authorization scheme for path: {path}")
                return self._unauthorized_response("Authorization scheme must be Bearer")
            if not token:
                logger.warning(f"Empty token value for path: {path}")
                return self._unauthorized_response("Token value is empty")
            
            analytics_client = get_analytics_client_instance(token)
            orgs = await asyncio.to_thread(analytics_client.get_orgs)

            allowed_org_ids = Settings.get_allowed_org_ids()
            if not allowed_org_ids:
                logger.error("MCP_SERVER_ORG_ID is not properly configured on the server")
                return self._unauthorized_response(
                    detail="Server misconfiguration: MCP_SERVER_ORG_ID is not set or empty",
                    error="server_misconfigured",
                )
            
            try:
                user_org_ids = {str(o.get("orgId")) for o in (orgs or []) if isinstance(o, dict) and o.get("orgId") is not None}
            except Exception:
                logger.warning(f"Unexpected orgs structure returned for path: {path}")
                return self._unauthorized_response(
                    detail="Unable to validate organization access for token",
                    error="invalid_token",
                )
            
            has_access = any(allowed_org in user_org_ids for allowed_org in allowed_org_ids)
            if not has_access:
                logger.warning(
                    f"Token does not have access to any allowed MCP server orgs. "
                    f"path={path} allowed_orgs={allowed_org_ids} user_orgs={list(user_org_ids)}"
                )
                return self._unauthorized_response(
                    detail="Token is not authorized for any of the required organizations",
                    error="invalid_token",
                )          

            logger.debug(f"Token validated successfully for path: {path}")
            
        except ValueError:
            logger.warning(f"Invalid Authorization header format for path: {path}")
            return self._unauthorized_response(detail="Invalid Authorization header format", error="invalid_token")

        except Exception as e:
            logger.error(f"Token validation failed for path: {path}", exc_info=True)
            return self._unauthorized_response(detail="Invalid or expired token", error="invalid_token")
        return await call_next(request)


def _consent_cookie_name(transaction_id: str) -> str:
    return f"consent_{transaction_id}"



@authRouter.get("/", response_class=FileResponse)
def index(request: Request):
    context = {
        "request": request,
        "mcp_url": Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/mcp"
    }
    return templates.TemplateResponse(request=request, name="index.html", context=context)


@authRouter.get("/.well-known/oauth-protected-resource")
async def oauth_protected_resource():
    """
    ## Proxy Protected Resource Metadata Endpoint

    Implements the Resource Server Metadata endpoint, detailing the characteristics
    of the protected resource managed by this proxy instance.

    All URIs returned here point to the proxy's public interface, 
    acting as the access point and intermediary for the MCP Clients.
    """
    logger.debug("Serving OAuth protected resource metadata")
    base = Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/"
    return {
        "resource": urljoin(base,"mcp"),
        "authorization_servers": [
            base
        ],
        "scopes_supported": [
            Settings.OAUTH_DEFAULT_SCOPE
        ],
        "bearer_methods_supported": [
            "header"
        ]
    }


@authRouter.get("/.well-known/oauth-authorization-server")
async def oauth_authorization_server():
    """
    ## OAuth 2.0 Authorization Server Metadata (Discovery)

    - Implements the OAuth 2.0 Authorization Server Metadata endpoint.
    - This endpoint returns the Proxy's own URI structure for all OAuth flows. 
    - The MCP Clients interact only with these endpoints.
    """
    logger.debug("Serving OAuth authorization server metadata")
    base = Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/"
    return {
        "issuer": base,
        "authorization_endpoint": urljoin(base, "authorize"),
        "token_endpoint": urljoin(base, "token"),
        "registration_endpoint": urljoin(base, "register"),
        "scopes_supported": [
            Settings.OAUTH_DEFAULT_SCOPE,
            Settings.OAUTH_OFFLINE_ACCESS_SCOPE
        ],
        "response_types_supported": [
            "code"
        ],
        "grant_types_supported": [
            "authorization_code",
            "refresh_token"
        ],
        "token_endpoint_auth_methods_supported": [
            "client_secret_post"
        ],
        "revocation_endpoint": urljoin(base, "revoke"),
        "revocation_endpoint_auth_methods_supported": [
            "client_secret_post"
        ],
        "code_challenge_methods_supported": [
            "S256"
        ]
    }


@authRouter.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(scenario_standard_rate_limit()),
        Depends(scenario_registration_rate_limit()),
    ],
)
async def register_client(payload: DynamicClientRegistrationRequest, request: Request):
    """
    ## Dynamic Client Registration (DCR) Endpoint

    Handles DCR requests from MCP Clients. This function acts as the Identity Broker by generating unique credentials and storing them internally, fully abstracting 
    the upstream Static-only OAuth provider (XXX Accounts).

    The generated credentials are owned and managed by the proxy, ensuring the upstream 
    Static Client ID/Secret remains protected and never exposed.
    """
    logger.info(f"Received client registration request with client_name: {payload.client_name}")

    client_ip = get_client_ip(request)
    if not client_ip:
        logger.warning("Unable to determine client IP for incoming registration request")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Unable to determine client IP for registration request"}
        )

    for uri in payload.redirect_uris or []:
        if not Settings.is_redirect_uri_allowed(uri):
            logger.warning(f"Client registration rejected: redirect_uri not allowed: {uri}")
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": "invalid_redirect_uri",
                    "error_description": "One or more redirect_uris are not permitted by this server."
                }
            )

    client_id = str(uuid.uuid4())
    client_secret = secrets.token_urlsafe(32)
    base = Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/"

    registed_clients_store.set(client_id,
        DynamicClientRegistrationRequest(
            redirect_uris=payload.redirect_uris or [],
            client_name=payload.client_name,
            scope=payload.scope,
            grant_types=payload.grant_types or ["authorization_code", "refresh_token"],
            response_types=payload.response_types or ["code"],
            secret=client_secret
        )
    , ttl_in_sec=Settings.OAUTH_REGISTERED_CLIENTS_TTL)
    logger.info(f"Client registered successfully: client_id={client_id}, client_name={payload.client_name}")


    """
    This might not be the most efficient way to limiting the number of active clients per IP, but given the limits, it should be sufficient and won't cause performance issues.
    """
    stored = client_ip_vs_client_ids_store.get(client_ip)
    client_ids: list[str] = stored.root if stored else []
    client_ids.append(client_id)
    max_clients = Settings.get_max_clients_per_ip()
    if max_clients is None:
        client_ip_vs_client_ids_store.set(
            client_ip,
            StringList(root=client_ids),
            ttl_in_sec=Settings.OAUTH_CLIENT_IP_MAPPING_TTL
        )
    else:
        client_ids_to_remove = client_ids[:-max_clients]  # remove oldest beyond limit
        client_ids = client_ids[-max_clients:]
        client_ip_vs_client_ids_store.set(
            client_ip,
            StringList(root=client_ids),
            ttl_in_sec=Settings.OAUTH_CLIENT_IP_MAPPING_TTL
        )
        for old_id in client_ids_to_remove:
            registed_clients_store.delete(old_id)
            logger.info(f"Removed old client_id {old_id} for IP {client_ip} …")

    return JSONResponse(content={
        "client_id": client_id,
        "client_secret": client_secret,
        "client_id_issued_at": int(__import__("time").time()),
        "token_endpoint_auth_method": "client_secret_post",
        "redirect_uris": payload.redirect_uris or [],
        "grant_types": payload.grant_types or ["authorization_code", "refresh_token"],
        "response_types": payload.response_types or ["code"],
        "scope": Settings.OAUTH_DEFAULT_SCOPE,
        "registration_client_uri": base + f"register/{client_id}",
        "registration_access_token": secrets.token_urlsafe(32)
    }, status_code=status.HTTP_200_OK)


def build_url_with_params(base_uri: str, params: dict[str, str | None]) -> str:
    """
    Append or merge query parameters into base_uri.
    """
    url = urlparse(base_uri)
    query = dict(parse_qsl(url.query))
    query.update({k: v for k, v in params.items() if v is not None})
    new_query = urlencode(query)
    new_url = url._replace(query=new_query)
    return urlunparse(new_url)


@authRouter.get("/authorize", dependencies=[Depends(scenario_standard_rate_limit())])
async def authorize(
        client_id: str = Query(
            ...,
            min_length=3,
            max_length=100,
            pattern=r"^[a-zA-Z0-9_\-\.]+$"
        ),
        redirect_uri: str = Query(
            ...,
            min_length=10,
            max_length=1000
        ),
        scope: str = Query(
            "",
            max_length=100
        ),
        state: str | None = Query(
            None,
            min_length=8,
            max_length=500
        ),
        code_challenge: str | None = Query(
            None,
            min_length=43,
            max_length=128,
            pattern=r"^[A-Za-z0-9\-._~]+$"
        ),
        code_challenge_method: Literal["S256"] | None = Query(None)
    ):
    """
    ## OAuth 2.0 Authorization Endpoint (Initial Step)

    Implements the first step of the Authorization Code Grant flow, acting as the 
    authentication and transaction initialization layer for the OAuth Proxy.

    Functionality: This endpoint validates the client request and captures the full 
    set of parameters before redirecting the user to the consent screen.

    Process:
    1. Client Validation: Verifies the incoming `client_id` against the proxy's 
       internal client registry (`REGISTERED_CLIENTS`) established during DCR.

    2. Redirect Validation: Ensures the provided `redirect_uri` matches a 
       registered URI for the authenticated client.
       
    3. Transaction State Storage: All incoming request parameters (including 
       `scope`, `state`, and PKCE parameters) are temporarily stored in memory 
       under a unique `transaction_id`.
    4. Consent Redirection: The user agent is redirected to the proxy's internal 
       `/consent` page, using the `transaction_id` (`txid`) to retrieve the stored 
       request details upon user approval.

    Architectural Role: This endpoint strictly handles the MCP Client's request 
    validation and state management. It is designed to prepare the request before it 
    is eventually translated and forwarded to the upstream provider's `/authorize` 
    endpoint (a step handled *after* user consent).
    """

    client : DynamicClientRegistrationRequest = registed_clients_store.get(client_id)
    if not client:
        logger.warning(f"Authorization request with invalid client_id: {client_id}")
        return FileResponse("static/invalid_token.html", media_type="text/html", status_code=401)

    if redirect_uri not in (client.redirect_uris or []):
        logger.warning(f"Authorization request with invalid redirect_uri for client_id: {client_id}")
        raise HTTPException(status_code=400, detail="invalid_redirect_uri")

    if not Settings.is_redirect_uri_allowed(redirect_uri):
        logger.warning(f"Authorization request with disallowed redirect_uri for client_id: {client_id}")
        raise HTTPException(status_code=400, detail="invalid_redirect_uri")
    
    logger.info(f"Creating authorization transaction for client_id: {client_id}")
    transaction_id = str(uuid.uuid4())
    now = datetime.now(UTC)
    auth_transactions_store.set(
        transaction_id,
        AuthorizationTransaction(
            created_at=now,
            expires_at=now + timedelta(seconds=Settings.OAUTH_AUTH_TRANSACTION_TTL),
            client_id=client_id,
            redirect_uri=redirect_uri,
            scope=scope or client.scope or Settings.OAUTH_DEFAULT_SCOPE,
            state=state,
            code_challenge=code_challenge,
            code_challenge_method=code_challenge_method,
        ),
        ttl_in_sec=Settings.OAUTH_AUTH_TRANSACTION_TTL
    )

    base = Settings.MCP_SERVER_PUBLIC_URL.rstrip("/") + "/"
    consent_base = urljoin(base, "consent")

    consent_url = build_url_with_params(consent_base, {
        "transaction_id": transaction_id,
    })

    logger.debug(f"Redirecting to consent page for transaction_id: {transaction_id}")
    return RedirectResponse(url=consent_url, status_code=302)


def generate_csrf_token(request: Request) -> str:
    """Generates a new CSRF token and stores it in the session."""
    if "csrf_token" not in request.session:
        request.session["csrf_token"] = secrets.token_urlsafe(32)
    return request.session["csrf_token"]



def validate_csrf_token(request: Request, form_token: str):
    """Validates the token from the form against the token in the session."""
    session_token = request.session.get("csrf_token")
    
    if not session_token or not form_token or session_token != form_token:
        request.session.pop("csrf_token", None)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Invalid CSRF token"
        )



templates = Jinja2Templates(directory="src/templates")

@authRouter.get("/consent", response_class=HTMLResponse, dependencies=[Depends(scenario_standard_rate_limit())])
async def consent(request: Request, transaction_id: str = Query(..., max_length=100)):
    logger.debug(f"Consent page requested for transaction_id: {transaction_id}")
    txn: AuthorizationTransaction = auth_transactions_store.get(transaction_id)
    if not txn:
        logger.warning(f"Invalid or missing transaction for transaction_id: {transaction_id}")
        raise HTTPException(status_code=400, detail="invalid_transaction")

    if txn.expires_at < datetime.now(timezone.utc):
        logger.warning(f"Expired transaction for transaction_id: {transaction_id}")
        auth_transactions_store.delete(transaction_id)
        raise HTTPException(status_code=400, detail="transaction_expired")

    client: DynamicClientRegistrationRequest = registed_clients_store.get(txn.client_id)
    if not client:
        logger.warning(f"Consent requested for unknown or expired client_id: {txn.client_id}")
        auth_transactions_store.delete(transaction_id)
        raise HTTPException(status_code=400, detail="invalid_client")

    redirect_uri = str(txn.redirect_uri)
    redirect_host = urlparse(redirect_uri).hostname
    is_loopback = redirect_host in ("localhost", "127.0.0.1", "::1")

    csrf_token = generate_csrf_token(request)

    # Jinja2Templates autoescapes .html templates, so values are passed raw.
    context = {
        "request": request,  # Required by FastAPI for TemplateResponse
        "transaction_id": transaction_id,
        "client_id": txn.client_id,
        "scope": txn.scope,
        "csrf_token": csrf_token,
        "app_name": client.client_name or "Unnamed application",
        "redirect_uri": redirect_uri,
        "redirect_host": redirect_host or redirect_uri,
        "is_loopback": is_loopback,
        "upstream_provider": "Zoho Accounts"
    }

    return templates.TemplateResponse(request=request, name="consent.html", context=context)

@authRouter.post("/consent/approve", dependencies=[Depends(scenario_standard_rate_limit())])
async def approve_consent(request: Request, transaction_id: str = Form(..., max_length=100),
                          csrf_token: str = Form(...)
                          ):
    """
    Handles user approval. Redirects the user's browser to the upstream
    provider's authorization endpoint using the proxy's static credentials
    and the transaction ID as the state parameter.
    """

    validate_csrf_token(request, csrf_token)

    logger.info(f"User approved consent for transaction_id: {transaction_id}")
    txn: AuthorizationTransaction = auth_transactions_store.get(transaction_id)
    if not txn:
        logger.warning(f"Approval attempted for invalid transaction_id: {transaction_id}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_transaction")

    if txn.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc): 
        logger.warning(f"Expired transaction in approval flow for transaction_id: {transaction_id}")
        auth_transactions_store.delete(transaction_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="transaction_expired")
    
    txn.approved = True
    txn.approval_nonce = secrets.token_urlsafe(32)
    remaining_ttl = max(
        1,
        int((ensure_aware_utc(txn.expires_at) - datetime.now(timezone.utc)).total_seconds()),
    )
    auth_transactions_store.set(transaction_id, txn, ttl_in_sec=remaining_ttl)


    upstream_auth_endpoint = urljoin(
        Settings.oidc_provider_base_url().rstrip('/') + '/', 
        "oauth/v2/auth"
    )

    proxy_callback_uri = urljoin(Settings.MCP_SERVER_PUBLIC_URL.rstrip('/') + '/', "auth/callback")
    upstream_params = {
        "client_id": Settings.OIDC_PROVIDER_CLIENT_ID, 
        "response_type": "code",
        "redirect_uri": proxy_callback_uri,
        "scope": txn.scope,
        "state": transaction_id,
        "access_type": "offline",
        "prompt": "Consent"
    }
    
    upstream_auth_url = build_url_with_params(upstream_auth_endpoint, upstream_params)
    logger.info(f"Redirecting user to upstream authorization endpoint for transaction_id: {transaction_id}")
    response = RedirectResponse(url=upstream_auth_url, status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=_consent_cookie_name(transaction_id),
        value=txn.approval_nonce,
        max_age=remaining_ttl,
        httponly=True,
        secure=Settings.MCP_SERVER_PUBLIC_URL.lower().startswith("https"),
        samesite="lax",   # must be Lax, not Strict: the callback is a cross-site top-level GET from Zoho
        path="/auth/callback",
    )
    return response



def build_error_redirect_url(base_url: str, params: Dict[str, str]) -> str:
    """Constructs a URL with query parameters, preserving existing structure."""
    parsed = urlparse(base_url)
    query = urlencode(params)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, query, parsed.fragment))


def ensure_aware_utc(dt: datetime) -> datetime:
    """
    Ensures a datetime object is timezone-aware (UTC) for comparison, 
    assuming naive datetimes (common in older in-memory objects) were intended to be UTC.
    """
    if dt.tzinfo is None or dt.tzinfo.utcoffset(dt) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@authRouter.get("/auth/callback", dependencies=[Depends(scenario_standard_rate_limit())])
async def proxy_callback(
    request: Request,
    code: str = Query(..., max_length=100), 
    state: str = Query(..., max_length=100),
    location: str | None = Query(None, max_length=200)
):
    """
    ## 🔄 Proxy Callback Endpoint (Code Brokerage)

    This endpoint is the registered Redirect URI that the Upstream Provider redirects the user to after successful authorization. It marks the transfer of 
    control and the exchange of the upstream authorization code for a proxy-issued 
    authorization code.

    Functionality: It brokers the authorization code received from the upstream 
    provider and issues a new, distinct authorization code back to the dynamic MCP Client.

    Process:
    1. Transaction Validation: The incoming `state` (which corresponds to the 
       `transaction_id` stored earlier) is validated against the active in-memory 
       transactions (`AUTH_TRANSACTIONS`) to prevent CSRF and replay attacks.
    2. Upstream Code Capture: The `code` (the upstream authorization code) and 
       any provider-specific parameters (`location`, `accounts_server`) are captured 
       and stored within the transaction state.
    3. Proxy Code Issuance: A new, unique authorization code (`new_auth_code`) 
       is generated by the proxy.
    4. Code Persistence: This new code is stored (`AUTHORIZATION_CODES`), linking 
       it back to the original client's details and the captured upstream code/parameters.
    5. Final Redirection: The user agent is redirected to the MCP Client's original `redirect_uri` along with the newly generated `code` and the client's 
       original `state` parameter.

    Architectural Role: This endpoint is vital for decoupling the MCP Client 
    from the upstream flow. The `new_auth_code` serves as an access key that the 
    MCP Client will use in the subsequent `/token` exchange, allowing the proxy 
    to retrieve the stored upstream code and complete the flow.
    """
    logger.info(f"Received callback from upstream provider for transaction_id: {state}")
    transaction_id = state
    txn: AuthorizationTransaction = auth_transactions_store.get(transaction_id)
    

    if not txn:
        logger.error(f"Callback received with invalid or expired transaction_id: {transaction_id}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_state_or_transaction_expired")

    if ensure_aware_utc(txn.expires_at) < datetime.now(timezone.utc):
        logger.warning(f"Expired transaction in callback for transaction_id: {transaction_id}")
        auth_transactions_store.delete(transaction_id)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="transaction_expired")

    auth_transactions_store.delete(transaction_id)

    cookie_nonce = request.cookies.get(_consent_cookie_name(transaction_id))
    if (
        not txn.approved
        or not txn.approval_nonce
        or not cookie_nonce
        or not hmac.compare_digest(cookie_nonce, txn.approval_nonce)
    ):
        logger.warning(f"Callback without valid consent approval for transaction_id: {transaction_id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="consent_required")
        

    logger.debug(f"Storing upstream authorization code for transaction_id: {transaction_id}")
    
    new_auth_code = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    

    auth_codes_store.set(
        new_auth_code,
        AuthorizationCode(
            created_at=now,
            expires_at=now + timedelta(seconds=Settings.OAUTH_AUTH_CODE_TTL),
            transaction_id=transaction_id,
            client_id=txn.client_id,
            redirect_uri=txn.redirect_uri,
            code_challenge=txn.code_challenge,
            code_challenge_method=txn.code_challenge_method,
            upstream_location=location,
            upstream_code=code
        ),
        ttl_in_sec=Settings.OAUTH_AUTH_CODE_TTL
    )

    logger.info(f"Generated proxy authorization code for client_id: {txn.client_id}")

    client_params = {
        "code": new_auth_code,
        "state": txn.state
    }
    
    final_redirect_url = build_url_with_params(txn.redirect_uri.__str__(), client_params)
    logger.debug(f"Redirecting to client callback URI for client_id: {txn.client_id}")
    response = RedirectResponse(url=final_redirect_url, status_code=status.HTTP_302_FOUND)
    response.delete_cookie(_consent_cookie_name(transaction_id), path="/auth/callback")
    return response


async def upstream_token_exchange(payload: dict) -> dict:
    """
    ## Upstream Token Exchange

    Performs the final token exchange with the Upstream OAuth Provider using 
    the statically registered client credentials.

    Functionality: This is a private helper function used internally by the 
    proxy's `/token` endpoint. It facilitates the exchange of the upstream 
authorization code (received during the `/auth/callback` step) for the 
    actual Access Token, Refresh Token, and ID Token from the upstream provider.
    """
    token_endpoint = urljoin(Settings.oidc_provider_base_url().rstrip('/') + '/', "oauth/v2/token")
    
    # Inject static proxy credentials for the upstream provider
    data = {
        **payload,
        "client_id": Settings.OIDC_PROVIDER_CLIENT_ID,
        "client_secret": Settings.OIDC_PROVIDER_CLIENT_SECRET,
    }

    # redirect_uri is only needed for the initial authorization_code exchange
    if payload.get("grant_type") == "authorization_code":
        data["redirect_uri"] = urljoin(Settings.MCP_SERVER_PUBLIC_URL.rstrip('/') + '/', "auth/callback")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_endpoint,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=5.0
            )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Upstream error: {e.response.text}")
        raise


@authRouter.post("/token", dependencies=[Depends(scenario_standard_rate_limit())])
async def token_exchange(
    grant_type: str = Form(..., max_length=100),
    code: Optional[str] = Form(None, max_length=200),
    redirect_uri: Optional[str] = Form(None, max_length=1000),
    client_id: str = Form(..., max_length=100),
    client_secret: str = Form(..., max_length=200),
    refresh_token: Optional[str] = Form(None, max_length=200),
    code_verifier: Optional[str] = Form(None, max_length=500)
    ):
    """
    ## OAuth 2.0 Token Exchange Endpoint (Final Step)

    This is the final step where the MCP Client exchanges its proxy-issued authorization code for 
    the upstream access and refresh tokens.

    Functionality: This endpoint performs comprehensive validation of the client and the code, 
    and then initiates the secure, backend-channel token exchange with the Upstream Provider. 

    This function completes the Indirection Layer. It is the last step where the proxy's 
    internal state (the authorization code linkage) is consumed, and the upstream tokens 
    are exposed to the authenticated MCP Client.
    """
    

    logger.info(f"Token exchange requested for client_id: {client_id}")

    client_data : DynamicClientRegistrationRequest = registed_clients_store.get(client_id)
    if not client_data or client_data.secret != client_secret:
        logger.warning(f"Invalid client credentials for client_id: {client_id}")
        return JSONResponse(
            status_code=401,
            content={
                "error": "invalid_client",
                "error_description": (
                    "The registered client has expired or is invalid. "
                    "Clear cached MCP credentials and re-authenticate."
                )
                # "help_url": "https://your-domain.com/static/invalid_token.html"
            }
        )

    upstream_payload = {"grant_type": grant_type}

    if grant_type == "authorization_code":
        if not code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="code_required")
            
        auth_code_data: AuthorizationCode = auth_codes_store.get(code)
        if not auth_code_data or auth_code_data.client_id != client_id:
            logger.warning(f"Invalid or mismatched code for client: {client_id}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")

        if ensure_aware_utc(auth_code_data.expires_at) < datetime.now(timezone.utc):
            auth_codes_store.delete(code)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")

        try:
            presented_redirect_uri = str(AnyUrl(redirect_uri)) if redirect_uri else None
        except ValueError:
            presented_redirect_uri = None
        if presented_redirect_uri != str(auth_code_data.redirect_uri):
            logger.warning(f"redirect_uri mismatch at token exchange for client: {client_id}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")

        validate_pkce(code_verifier=code_verifier, code_challenge=auth_code_data.code_challenge, method=auth_code_data.code_challenge_method)
        upstream_payload["code"] = auth_code_data.upstream_code
        auth_codes_store.delete(code)

    elif grant_type == "refresh_token":
        if not refresh_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refresh_token_required")
        
        upstream_payload["refresh_token"] = refresh_token

    else:
        logger.warning(f"Unsupported grant type: {grant_type}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported_grant_type")


    try:
        upstream_tokens = await upstream_token_exchange(upstream_payload)
        return JSONResponse(content=upstream_tokens, status_code=status.HTTP_200_OK)
    except Exception:
        logger.error(f"Upstream exchange failed for {grant_type}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="upstream_token_exchange_failed")
    


_PKCE_VERIFIER_RE = re.compile(r"^[A-Za-z0-9\-._~]{43,128}$")

def _base64url_no_pad(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")

def validate_pkce(code_verifier: str | None, code_challenge: str | None, method: str | None):
    if not code_challenge:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_request"  # or "invalid_grant"
        )

    if not code_verifier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_request"  # or "invalid_grant"
        )

    if not _PKCE_VERIFIER_RE.match(code_verifier):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_request")

    m = (method or "plain").upper()
    if m == "S256":
        computed = _base64url_no_pad(hashlib.sha256(code_verifier.encode("ascii")).digest())
    elif m == "PLAIN":
        computed = code_verifier
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_request")

    # constant-time compare
    if not hmac.compare_digest(computed, code_challenge):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_grant")