# Update from Settings

Open **Settings** and select **Check for Updates**.
When a newer release is available, select **Update Now**.
The page reconnects after the restart and checks the running version.

Updating restarts the app, and a task that is running cannot resume where it
stopped. While any background task is running, such as a download or a tag
scan, **Update Now** stays disabled and the update API refuses the request.
Queued tasks do not block an update: they wait and start in the new version.

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

## When Settings cannot update directly

Settings names the reason and links to this page.

| Message                                       | Cause                                             | Fix                                 |
| --------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| Direct updates are unavailable in development | Ella runs under `next dev`                        | Use `git pull`                      |
| The update service is not installed           | No updater socket                                 | Install the host updater (above)    |
| The update service is not running             | The socket exists but nothing answers             | `sudo systemctl start ella-updater` |
| Ella cannot access the update service         | The socket permissions do not match the container | Run the installer again             |
| The update service is not responding          | Any other error                                   | Read the updater log (below)        |

Without the host updater, update by hand from the folder that holds the Compose file:

```bash
docker compose pull && docker compose up -d
```

## Failed updates

If the image pull fails, the current container keeps running.
If startup fails after recreation, the service reports failure and requires operator recovery.
The updater does not roll back the database.

## Database backups

A new release migrates the database when it first starts, and migrations cannot be undone.
Before migrating, Ella copies the database to `data/backups/`, named for the time and the two versions, for example `catalog-2026-09-25T10-24-25-241Z-0.2.0-to-0.3.0.db`.
It keeps the five newest copies.
If the copy fails, for example because the disk is full, Ella does not start, and the database is left as it was.
A start that fails during the migration does not copy the half-migrated database again.

To go back to the previous release, from the folder that holds the Compose file:

```bash
docker compose down
cp data/backups/<copy>.db data/catalog.db
rm -f data/catalog.db-wal data/catalog.db-shm
```

Then set `image` in `compose.yml` to the previous release's image, `ghcr.io/apo5698/ella:sha-<commit>`, where `<commit>` is the full commit hash shown on that release's GitHub page, and run `docker compose up -d`.
Changes made after the copy was taken are lost.

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
