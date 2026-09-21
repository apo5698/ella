#!/usr/bin/env python3
"""Update the configured Ella Compose service through a local Unix socket."""

import argparse
import json
import os
from pathlib import Path
import re
import socketserver
import subprocess
import threading
from http.server import BaseHTTPRequestHandler

IMAGE = "ghcr.io/apo5698/ella"
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)")


class Updater:
    def __init__(self, config, run=subprocess.run):
        self.config = config
        self.run = run
        self.lock = threading.Lock()
        self.state_lock = threading.Lock()
        self.directory = Path(config.get("state_dir", "/var/lib/ella-updater"))
        self.directory.mkdir(parents=True, exist_ok=True)
        self.state_file = self.directory / "status.json"
        self.state = {"state": "idle", "version": None, "message": ""}
        if self.state_file.exists():
            self.state = json.loads(self.state_file.read_text())
        if self.state["state"] in ("pulling", "restarting"):
            self.set_state("failed", self.state["version"], "Updater restarted during an update. Check the deployment before retrying.")

    def snapshot(self):
        with self.state_lock:
            return dict(self.state)

    def set_state(self, state, version, message=""):
        with self.state_lock:
            self.state = {"state": state, "version": version, "message": message}
            temporary = self.state_file.with_suffix(".tmp")
            temporary.write_text(json.dumps(self.state))
            temporary.replace(self.state_file)

    def command(self, args, timeout=180):
        return self.run(args, cwd=Path(self.config["compose_file"]).parent,
                        check=True, capture_output=True, text=True, timeout=timeout).stdout.strip()

    def compose(self, override=None):
        args = ["docker", "compose", "-f", self.config["compose_file"],
                "-f", self.config["updater_compose_file"]]
        if override:
            args += ["-f", str(override)]
        return args

    def start(self, version):
        if not isinstance(version, str) or not VERSION.fullmatch(version):
            raise ValueError("A stable version is required")
        if not self.lock.acquire(blocking=False):
            return self.snapshot()
        try:
            self.set_state("pulling", version)
            accepted = self.snapshot()
            threading.Thread(target=self.execute, args=(version,), daemon=True).start()
            return accepted
        except Exception:
            self.lock.release()
            raise

    def execute(self, version):
        try:
            service = self.config.get("service", "app")
            # Pull completes before the old container is stopped.
            self.command(["docker", "pull", f"{IMAGE}:{version}"], timeout=900)
            override = self.directory / "image.json"
            override.write_text(json.dumps({"services": {service: {
                "image": f"{IMAGE}:{version}", "pull_policy": "never",
            }}}))
            self.set_state("restarting", version)
            self.command(self.compose(override) + ["up", "-d", "--no-deps", "--no-build",
                "--pull", "never", "--wait", "--wait-timeout", "120", service])
            container = self.command(self.compose(override) + ["ps", "-q", service])
            if not container or "\n" in container:
                raise RuntimeError("Expected one Ella container")
            info = json.loads(self.command(["docker", "inspect", container]))[0]
            if info.get("State", {}).get("Health", {}).get("Status") != "healthy":
                raise RuntimeError("The new container is not healthy")
            if f"APP_VERSION={version}" not in info.get("Config", {}).get("Env", []):
                raise RuntimeError("The image version does not match the release")
            self.set_state("succeeded", version)
        except Exception as error:
            print(f"Update failed: {error}", flush=True)
            self.set_state("failed", version, "Update failed. Check the updater service journal.")
        finally:
            self.lock.release()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/update":
            return self.reply(404, {"error": "Not found"})
        self.reply(200, self.server.updater.snapshot())

    def do_POST(self):
        if self.path != "/update":
            return self.reply(404, {"error": "Not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 1024:
                raise ValueError("Invalid body length")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError("Invalid body")
            self.reply(202, self.server.updater.start(body.get("version")))
        except (ValueError, TypeError):
            self.reply(400, {"error": "Invalid version"})


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(5)
        return connection, address


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="/etc/ella-updater.json")
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    updater = Updater(config)
    socket = Path(config.get("socket", "/run/ella-updater/control.sock"))
    socket.parent.mkdir(parents=True, exist_ok=True)
    socket.unlink(missing_ok=True)
    with Server(str(socket), Handler) as server:
        server.updater = updater
        os.chmod(socket, 0o660)
        os.chown(socket, -1, config.get("socket_gid", 1001))
        server.serve_forever()


if __name__ == "__main__":
    main()
