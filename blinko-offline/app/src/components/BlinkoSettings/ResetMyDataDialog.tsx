import { RootStore } from "@/store";
import { DialogStandaloneStore } from "@/store/module/DialogStandalone";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Alert, Button, Checkbox, Input } from "@heroui/react";
import { api } from "@/lib/trpc";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

const CONFIRM_PHRASE = "RESET";

const ResetMyDataDialogContent = observer(({ onSuccess }: { onSuccess?: () => void }) => {
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);
  const dialog = RootStore.Get(DialogStandaloneStore);

  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const typedOk = useMemo(() => typed.trim().toUpperCase() === CONFIRM_PHRASE, [typed]);
  const canContinue = typedOk && checked && !loading;

  const close = () => dialog.close();

  const doReset = async () => {
    setError("");
    setLoading(true);
    try {
      await api.task.resetMyData.mutate({ confirmPhrase: typed.trim() });
      toast.success(t("reset-my-data-success"));
      close();
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  if (step === 2) {
    return (
      <div className="flex flex-col gap-4">
        <Alert color="danger" variant="flat">
          {t("reset-my-data-final-warning")}
        </Alert>
        {error ? (
          <Alert color="danger" variant="flat">
            {error}
          </Alert>
        ) : null}
        <div className="flex gap-2 justify-end">
          <Button variant="flat" onPress={() => setStep(1)} isDisabled={loading}>
            {t("back")}
          </Button>
          <Button color="danger" onPress={doReset} isLoading={loading}>
            {t("reset-my-data")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert color="danger" variant="flat">
        {t("reset-my-data-warning")}
      </Alert>

      <div className="flex flex-col gap-2">
        <Input
          label={t("type-reset-to-confirm")}
          placeholder={CONFIRM_PHRASE}
          value={typed}
          onValueChange={(v) => setTyped(v)}
          isInvalid={Boolean(typed) && !typedOk}
          errorMessage={Boolean(typed) && !typedOk ? t("reset-confirm-phrase-invalid") : undefined}
        />
        <Checkbox isSelected={checked} onValueChange={(v) => setChecked(v)}>
          {t("reset-my-data-ack")}
        </Checkbox>
      </div>

      {error ? (
        <Alert color="danger" variant="flat">
          {error}
        </Alert>
      ) : null}

      <div className="flex gap-2 justify-end">
        <Button variant="flat" onPress={close} isDisabled={loading}>
          {t("cancel")}
        </Button>
        <Button color="danger" onPress={() => setStep(2)} isDisabled={!canContinue}>
          {t("continue")}
        </Button>
      </div>
    </div>
  );
});

export const showResetMyDataDialog = (opts: { onSuccess?: () => void } = {}) => {
  RootStore.Get(DialogStandaloneStore).setData({
    isOpen: true,
    onlyContent: false,
    size: "lg",
    title: i18n.t("reset-my-data"),
    content: <ResetMyDataDialogContent onSuccess={opts.onSuccess} />,
  });
};
