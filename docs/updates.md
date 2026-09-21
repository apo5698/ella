# Update from Settings

Open **Settings** and select **Check for updates**.
When a newer release is available, select **Update and restart**.
The page reconnects after the restart and checks the running version.

The host updater pulls the release image before it restarts Ella.
It uses the existing Compose configuration and preserves its volume mounts.
It reports success only after the container healthcheck passes and its version matches the release.
Concurrent requests share one update operation.

## Install the host updater

Requirements: Linux with systemd, Python 3.9 or later, Docker Compose with `up --wait`, and an `app` service with a healthcheck.
The app container must use group ID 1001, which is the default in the Ella image.
The Docker host needs access to pull the release image from GHCR.

From an Ella checkout on the Docker host, run:

```bash
sudo bash deploy/updater/install.sh /absolute/path/to/compose.yml
```

The installer creates a systemd service and a separate `compose.updater.json` file beside the host Compose file.
It recreates the app once to mount the updater socket.
It does not replace the host Compose file or change the media paths.
After installation, updates can run from Settings.

The app accesses a local Unix socket. It does not receive access to the Docker socket.
The updater accepts stable version numbers for the Ella image only.
Keep the app behind the existing trusted network or authentication gateway: users who can access Settings can request updates.

## Failed updates

If the image pull fails, the current container keeps running.
If startup fails after recreation, the service reports failure and requires operator recovery.
The updater does not roll back the database. Maintain backups before application upgrades.

Read the updater log on the host:

```bash
sudo journalctl -u ella-updater -n 100
```

The updater stores its status in `/var/lib/ella-updater/status.json`.
If the updater restarts during an update, it marks that operation as failed.
Refresh Settings to check the current state before retrying.

For later manual Compose commands, include both configuration files to preserve the socket mount:

```bash
docker compose -f compose.yml -f compose.updater.json up -d
```
