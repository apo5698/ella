import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("updater", Path(__file__).with_name("server.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.commands = []
        self.fail_pull = False
        self.healthy = True
        self.config = {"state_dir": self.temp.name, "compose_file": "/srv/example/compose.yml", "updater_compose_file": "/srv/example/compose.updater.json"}
        self.updater = module.Updater(self.config, self.run_command)

    def run_command(self, args, **kwargs):
        self.commands.append(args)
        if args[1] == "pull" and self.fail_pull:
            raise subprocess.CalledProcessError(1, args)
        output = ""
        if "ps" in args:
            output = "container-id"
        if args[1] == "inspect":
            output = json.dumps([{"Config":{"Env":["APP_VERSION=0.2.0"]}, "State":{"Health":{"Status":"healthy" if self.healthy else "unhealthy"}}}])
        return subprocess.CompletedProcess(args, 0, output, "")

    def execute(self):
        self.updater.lock.acquire()
        self.updater.execute("0.2.0")

    def test_success_checks_health_and_preserves_compose(self):
        self.execute()
        self.assertEqual(self.updater.snapshot()["state"], "succeeded")
        self.assertEqual(self.commands[0], ["docker", "pull", "ghcr.io/apo5698/ella:0.2.0"])
        self.assertIn("--no-deps", self.commands[1])
        self.assertIn(self.config["compose_file"], self.commands[1])
        self.assertEqual(module.Updater(self.config).snapshot()["state"], "succeeded")

    def test_failed_pull_never_stops_current_container(self):
        self.fail_pull = True
        self.execute()
        self.assertEqual(len(self.commands), 1)
        self.assertEqual(self.updater.snapshot()["state"], "failed")

    def test_failed_health_is_not_success(self):
        self.healthy = False
        self.execute()
        self.assertEqual(self.updater.snapshot()["state"], "failed")

    def test_rejects_arbitrary_images_and_commands(self):
        for version in [None, "latest", "0.2.0; reboot", "other/image:1.0.0", "01.0.0", "0.2.0-beta.1"]:
            with self.assertRaises(ValueError):
                self.updater.start(version)
        self.assertEqual(self.commands, [])

    def test_duplicate_update_is_not_started(self):
        self.updater.lock.acquire()
        with patch.object(module.threading, "Thread") as thread:
            self.updater.start("0.2.0")
            thread.assert_not_called()
        self.updater.lock.release()

    def test_interrupted_updater_reports_failure(self):
        self.updater.set_state("restarting", "0.2.0")
        self.assertEqual(module.Updater(self.config).snapshot()["state"], "failed")


if __name__ == "__main__":
    unittest.main()
