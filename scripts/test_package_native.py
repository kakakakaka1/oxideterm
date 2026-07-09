#!/usr/bin/env python3
"""Tests for native release packaging helpers."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import package_native


class WindowsInstallerScriptTests(unittest.TestCase):
    def identity(self) -> package_native.ReleaseIdentity:
        return package_native.ReleaseIdentity(
            channel="gpui-preview",
            app_name="OxideTerm GPUI Preview",
            app_identifier="com.oxideterm.gpuiPreview",
            windows_install_dir=r"$LOCALAPPDATA\Programs\OxideTerm GPUI Preview",
            windows_registry_key="OxideTerm GPUI Preview",
            windows_uninstall_key="OxideTerm GPUI Preview",
            linux_package_name="oxideterm-gpui-preview",
            linux_install_dir="oxideterm-gpui-preview",
            linux_desktop_id="com.oxideterm.gpuiPreview",
            linux_icon_name="oxideterm-gpui-preview",
        )

    def test_existing_install_is_upgraded_in_place(self) -> None:
        identity = self.identity()
        script = package_native.windows_installer_script(
            binary=Path("oxideterm-native.exe"),
            version="1.2.0-gpui-preview.2",
            identity=identity,
            installer_root=Path(r"C:\dist\nsis-windows_x64"),
            installer_path=Path(r"C:\dist\OxideTerm_setup.exe"),
            icon_path=Path(r"C:\icons\icon.ico"),
        )

        self.assertIn("InstallDirRegKey HKCU", script)
        self.assertIn("SetOverwrite on", script)
        self.assertIn("WriteUninstaller", script)
        self.assertIn("WriteRegStr HKCU", script)
        self.assertIn("normal_install:", script)
        self.assertNotIn("already installed", script)
        self.assertNotIn("uninstall_existing", script)
        self.assertNotIn("ExecWait", script)

    def test_update_mode_stages_files_and_installs_helper_directly(self) -> None:
        script = package_native.windows_installer_script(
            binary=Path("oxideterm-native.exe"),
            version="1.2.0-gpui-preview.2",
            identity=self.identity(),
            installer_root=Path(r"C:\dist\nsis-windows_x64"),
            installer_path=Path(r"C:\dist\OxideTerm_setup.exe"),
            icon_path=Path(r"C:\icons\icon.ico"),
        )

        self.assertIn('/OXIDETERM_UPDATE=1', script)
        self.assertIn('SetSilent silent', script)
        self.assertIn('RMDir /r "$INSTDIR\\install"', script)
        self.assertIn('SetOutPath "$INSTDIR\\tools"', script)
        self.assertIn('tools/oxideterm-update-helper.exe"', script)
        self.assertIn('SetOutPath "$INSTDIR\\install"', script)


if __name__ == "__main__":
    unittest.main()
