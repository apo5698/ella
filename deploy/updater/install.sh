#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 || "$#" -ne 1 ]]; then
  echo "Usage: sudo bash deploy/updater/install.sh /absolute/path/to/compose.yml" >&2
  exit 1
fi

updater_source="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
compose_path="$(realpath -- "$1")"
test -f "$compose_path"
cd -- "$(dirname -- "$compose_path")"
command -v python3 >/dev/null
command -v docker >/dev/null
command -v systemctl >/dev/null
docker compose version >/dev/null

# Check the host configuration without replacing it.
docker compose -f "$compose_path" config --format json | python3 -c '
import json,sys
service=json.load(sys.stdin).get("services",{}).get("app",{})
if not service.get("healthcheck") or service["healthcheck"].get("disable"):
    sys.exit("The app service needs a Docker healthcheck before updates can be enabled.")
'

install -d -m 0755 /opt/ella-updater
install -m 0644 "$updater_source/server.py" /opt/ella-updater/server.py
install -m 0644 "$updater_source/ella-updater.service" /etc/systemd/system/ella-updater.service
python3 - "$compose_path" <<'PY'
import json,sys
from pathlib import Path
compose=Path(sys.argv[1])
overlay=compose.parent / "compose.updater.json"
overlay.write_text(json.dumps({"services":{"app":{"volumes":[{
    "type":"bind","source":"/run/ella-updater","target":"/run/ella-updater","read_only":True
}]}}}, indent=2)+"\n")
Path("/etc/ella-updater.json").write_text(json.dumps({
    "compose_file":str(compose),"updater_compose_file":str(overlay),"service":"app"
}, indent=2)+"\n")
PY
systemctl daemon-reload
systemctl enable ella-updater
systemctl restart ella-updater
for attempt in {1..30}; do
  [[ -S /run/ella-updater/control.sock ]] && break
  sleep 1
done
test -S /run/ella-updater/control.sock
docker compose -f "$compose_path" -f "$(dirname -- "$compose_path")/compose.updater.json" up -d --no-deps --no-build --pull never --wait --wait-timeout 120 app
echo "Ella updater is ready. Open Settings to check for updates."
