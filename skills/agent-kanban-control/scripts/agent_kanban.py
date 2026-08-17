#!/usr/bin/env python3
"""Configure and call Agent Kanban without exposing personal tokens in commands."""

from __future__ import annotations

import argparse
import getpass
import json
import os
import stat
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


CONFIG_ENV = "AGENT_KANBAN_CONFIG"
URL_ENV = "AGENT_KANBAN_URL"
TOKEN_ENV = "AGENT_KANBAN_TOKEN"
USER_AGENT = "agent-kanban-control-skill/1"


class ConfigurationError(RuntimeError):
    """Raised when Agent Kanban credentials are missing or invalid."""


def config_path() -> Path:
    override = os.environ.get(CONFIG_ENV)
    if override:
        return Path(override).expanduser()

    if os.name == "nt" and os.environ.get("APPDATA"):
        return Path(os.environ["APPDATA"]) / "agent-kanban" / "config.json"

    config_home = os.environ.get("XDG_CONFIG_HOME")
    root = Path(config_home).expanduser() if config_home else Path.home() / ".config"
    return root / "agent-kanban" / "config.json"


def normalize_base_url(value: str) -> str:
    base_url = value.strip().rstrip("/")
    parsed = urlsplit(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ConfigurationError("Base URL must be an absolute http:// or https:// URL.")
    if parsed.username or parsed.password:
        raise ConfigurationError("Base URL must not contain credentials.")
    if parsed.query or parsed.fragment:
        raise ConfigurationError("Base URL must not contain a query string or fragment.")
    return base_url


def validate_token(value: str) -> str:
    token = value.strip()
    if not token:
        raise ConfigurationError("Token must not be empty.")
    if any(character.isspace() for character in token):
        raise ConfigurationError("Token must not contain whitespace.")
    return token


def read_config_file(path: Path) -> dict[str, str]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"Cannot read config at {path}: {error}") from error

    if not isinstance(raw, dict):
        raise ConfigurationError(f"Config at {path} must contain a JSON object.")
    return {
        "base_url": str(raw.get("base_url", "")),
        "token": str(raw.get("token", "")),
    }


def load_credentials() -> tuple[str, str, str]:
    path = config_path()
    stored = read_config_file(path)
    env_url = os.environ.get(URL_ENV)
    env_token = os.environ.get(TOKEN_ENV)
    raw_base_url = env_url or stored.get("base_url", "")
    raw_token = env_token or stored.get("token", "")
    if not raw_base_url or not raw_token:
        raise ConfigurationError(
            "Agent Kanban is not configured. Run 'agent_kanban.py configure' first."
        )
    base_url = normalize_base_url(raw_base_url)
    token = validate_token(raw_token)

    if env_url and env_token:
        source = "environment"
    elif env_url or env_token:
        source = f"environment + {path}"
    else:
        source = str(path)
    return base_url, token, source


def write_config(path: Path, base_url: str, token: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".config-", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump({"base_url": base_url, "token": token}, handle, indent=2)
            handle.write("\n")
        os.replace(temporary_path, path)
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise


def build_url(base_url: str, path: str) -> str:
    parsed = urlsplit(path)
    if not path.startswith("/") or parsed.scheme or parsed.netloc:
        raise ConfigurationError(
            "Request path must be relative to the configured instance and start with '/'."
        )
    return f"{base_url}{path}"


def url_origin(value: str) -> tuple[str, str | None, int | None]:
    parsed = urlsplit(value)
    default_port = 443 if parsed.scheme.lower() == "https" else 80
    return parsed.scheme.lower(), parsed.hostname, parsed.port or default_port


class SameOriginRedirectHandler(HTTPRedirectHandler):
    """Allow redirects without ever forwarding credentials to another origin."""

    def redirect_request(  # type: ignore[override]
        self,
        request: Request,
        file_pointer: Any,
        code: int,
        message: str,
        headers: Any,
        new_url: str,
    ) -> Request | None:
        if url_origin(request.full_url) != url_origin(new_url):
            raise ConfigurationError("Refused to forward credentials across an origin redirect.")
        return super().redirect_request(
            request, file_pointer, code, message, headers, new_url
        )


def encode_json(value: str | None, file_path: str | None) -> bytes | None:
    if value is None and file_path is None:
        return None
    try:
        if file_path is not None:
            payload: Any = json.loads(Path(file_path).read_text(encoding="utf-8"))
        else:
            payload = json.loads(value or "")
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"Cannot read JSON request body: {error}") from error
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def perform_request(
    base_url: str,
    token: str,
    method: str,
    path: str,
    body: bytes | None = None,
    timeout: float = 30,
) -> tuple[int, str, bytes]:
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    request = Request(
        build_url(base_url, path),
        data=body,
        headers=headers,
        method=method.upper(),
    )
    try:
        with build_opener(SameOriginRedirectHandler()).open(request, timeout=timeout) as response:
            return response.status, response.headers.get_content_type(), response.read()
    except HTTPError as error:
        response_body = error.read()
        message = response_body.decode("utf-8", errors="replace").strip().replace(
            token, "<redacted>"
        )
        detail = f": {message}" if message else ""
        raise ConfigurationError(f"Agent Kanban returned HTTP {error.code}{detail}") from error
    except URLError as error:
        raise ConfigurationError(f"Cannot reach Agent Kanban: {error.reason}") from error


def print_response(content_type: str, body: bytes) -> None:
    if not body:
        return
    if content_type == "application/json" or content_type.endswith("+json"):
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            pass
        else:
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
            return
    sys.stdout.buffer.write(body)
    if not body.endswith(b"\n"):
        sys.stdout.buffer.write(b"\n")


def configure(args: argparse.Namespace) -> int:
    base_url = normalize_base_url(args.base_url or input("Agent Kanban base URL: "))
    if args.token_stdin:
        token = validate_token(sys.stdin.readline())
    else:
        token = validate_token(getpass.getpass("Personal API token: "))

    if not args.skip_verify:
        perform_request(base_url, token, "GET", "/api/projects", timeout=args.timeout)

    path = config_path()
    write_config(path, base_url, token)
    print(f"Saved Agent Kanban access for {base_url} in {path}")
    print("The token was stored with user-only file permissions and was not printed.")
    return 0


def status(_: argparse.Namespace) -> int:
    base_url, _token, source = load_credentials()
    print(f"Agent Kanban base URL: {base_url}")
    print(f"Credential source: {source}")
    print("Token: configured (value hidden)")
    return 0


def request(args: argparse.Namespace) -> int:
    base_url, token, _source = load_credentials()
    body = encode_json(args.json, args.json_file)
    _status, content_type, response_body = perform_request(
        base_url,
        token,
        args.method,
        args.path,
        body=body,
        timeout=args.timeout,
    )
    print_response(content_type, response_body)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Configure and call Agent Kanban with a shared per-user credential."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    configure_parser = subparsers.add_parser(
        "configure", help="Save and verify the global per-user connection."
    )
    configure_parser.add_argument("--base-url", help="Agent Kanban instance URL.")
    configure_parser.add_argument(
        "--token-stdin",
        action="store_true",
        help="Read the token from standard input instead of a hidden prompt.",
    )
    configure_parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="Save without checking GET /api/projects.",
    )
    configure_parser.add_argument("--timeout", type=float, default=30)
    configure_parser.set_defaults(handler=configure)

    status_parser = subparsers.add_parser(
        "status", help="Show the active URL and credential source without the token."
    )
    status_parser.set_defaults(handler=status)

    request_parser = subparsers.add_parser(
        "request", help="Send an authenticated request to a relative API path."
    )
    request_parser.add_argument("method", help="HTTP method, for example GET or POST.")
    request_parser.add_argument("path", help="Relative API path beginning with '/'.")
    request_body = request_parser.add_mutually_exclusive_group()
    request_body.add_argument("--json", help="JSON request body.")
    request_body.add_argument("--json-file", help="Read the JSON request body from a file.")
    request_parser.add_argument("--timeout", type=float, default=30)
    request_parser.set_defaults(handler=request)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.handler(args)
    except ConfigurationError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
