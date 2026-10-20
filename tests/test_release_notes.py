import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".github/scripts/release-notes.sh"


class ReleaseNotesTests(unittest.TestCase):
    def run_notes(self, *args, cwd=ROOT):
        return subprocess.run(
            ["bash", str(SCRIPT), *args], cwd=cwd, text=True, capture_output=True,
        )

    def test_merged_pr_keeps_title_and_number(self):
        result = self.run_notes("0.5.8", "Refactor plugin", "42")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "Refactor plugin (#42)\n")

    def test_manual_patch_keeps_literal_multiline_notes_without_pr_suffix(self):
        notes = "Refactor plugin\nHandheld verification pending. $(echo not-executed)"
        result = self.run_notes("0.5.8", notes, "")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, notes + "\n")

    def test_patch_without_notes_fails(self):
        result = self.run_notes("0.5.8", "", "")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("need release notes", result.stderr)

    def test_minor_release_still_uses_changelog(self):
        result = self.run_notes("0.5.0", "Ignored manual notes", "")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Shut down a PC", result.stdout)
        self.assertNotIn("Ignored manual notes", result.stdout)
        self.assertNotIn("## 0.4", result.stdout)

    def test_minor_release_without_changelog_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_notes("0.6.0", "Manual notes", "", cwd=directory)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("minor releases need a written changelog", result.stderr)
