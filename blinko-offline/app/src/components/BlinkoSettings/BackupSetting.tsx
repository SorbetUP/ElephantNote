import { Button, Card } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import { Icon } from "@/components/Common/Iconify/icons";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { isInTauri } from "@/lib/tauriHelper";

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { presentShareSheet } from "tauri-plugin-blinko-api";

type BackupExportResult = {
  path: string;
  filename: string;
  size: number;
};

export const BackupSetting = observer(() => {
  const { t } = useTranslation();

  if (!isInTauri()) return null;

  const createBackup = async () => {
    try {
      RootStore.Get(ToastPlugin).loading(t("backup-creating"), { id: "backup" });
      const res = await invoke<BackupExportResult>("export_local_backup");
      RootStore.Get(ToastPlugin).dismiss("backup");
      await presentShareSheet({ path: res.path, mime: "application/zip", filename: res.filename });
      RootStore.Get(ToastPlugin).success(t("backup-created"));
    } catch (err) {
      RootStore.Get(ToastPlugin).dismiss("backup");
      RootStore.Get(ToastPlugin).error(
        `${t("operation-failed")}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const restoreBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Blinko backup", extensions: ["bko", "zip"] }],
      });
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (!filePath) return;

      RootStore.Get(ToastPlugin).loading(t("backup-restoring"), { id: "backup-restore" });
      await invoke("restore_local_backup", { filePath });
      RootStore.Get(ToastPlugin).dismiss("backup-restore");
      RootStore.Get(ToastPlugin).success(t("backup-restore-complete"));

      // Restoring the DB requires an app restart (sqlite pool is closed).
      setTimeout(() => {
        void invoke("exit_app", { code: 0 });
      }, 600);
    } catch (err) {
      RootStore.Get(ToastPlugin).dismiss("backup-restore");
      RootStore.Get(ToastPlugin).error(
        `${t("operation-failed")}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <Card shadow="none" className="flex flex-col gap-3 p-4 bg-background">
      <div className="text-sm opacity-70">{t("backup-desc")}</div>

      <div className="flex flex-wrap gap-2">
        <Button
          color="primary"
          onPress={createBackup}
          startContent={<Icon icon="tabler:cloud-upload" width="20" height="20" />}
        >
          {t("backup-create")}
        </Button>
        <Button
          variant="bordered"
          onPress={restoreBackup}
          startContent={<Icon icon="tabler:cloud-download" width="20" height="20" />}
        >
          {t("backup-restore")}
        </Button>
      </div>
    </Card>
  );
});

