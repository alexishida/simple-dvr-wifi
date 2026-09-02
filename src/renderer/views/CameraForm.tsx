import { useState } from "react";
import { parseHttpUrl, parseRtspUrl } from "../../shared/camera-urls.js";
import { ActivityIcon, CheckIcon, CloseIcon } from "../icons.js";
import type { CameraFormProps } from "./camera-types.js";

export function CameraForm({
  initial,
  editingId,
  onSaved,
  onCancel,
}: CameraFormProps): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? "");
  const [host, setHost] = useState(initial?.host ?? "");
  const [port, setPort] = useState(initial?.port?.toString() ?? "");
  const [onvifUrl, setOnvifUrl] = useState(initial?.onvifUrl ?? "");
  const [rtspUrl, setRtspUrl] = useState(initial?.rtspUrl ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{
    kind: "error" | "info" | "success";
    text: string;
  } | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  function applyRtspCredentials(raw: string): void {
    const parsed = parseRtspUrl(raw);
    if (!parsed) return;
    if (parsed.username) setUsername(parsed.username);
    if (parsed.password) setPassword(parsed.password);
  }

  function applyRtspDetails(raw: string): void {
    const parsed = parseRtspUrl(raw);
    if (!parsed) return;

    setRtspUrl(parsed.sanitizedUrl);
    setHost((current) => current.trim() || parsed.host);
    setPort((current) => current.trim() || String(parsed.port));
    applyRtspCredentials(raw);
  }

  function applyOnvifCredentials(raw: string): void {
    const parsed = parseHttpUrl(raw);
    if (!parsed) return;
    if (parsed.username) setUsername(parsed.username);
    if (parsed.password) setPassword(parsed.password);
  }

  function applyOnvifDetails(raw: string): void {
    if (parseRtspUrl(raw)) {
      setOnvifUrl("");
      applyRtspDetails(raw);
      setMessage({
        kind: "info",
        text: "URL RTSP movida para o campo RTSP; credenciais preenchidas.",
      });
      return;
    }
    const parsed = parseHttpUrl(raw);
    if (!parsed) return;
    setOnvifUrl(parsed.sanitizedUrl);
    applyOnvifCredentials(raw);
  }

  function handleOnvifChange(raw: string): void {
    if (parseRtspUrl(raw)) {
      applyOnvifDetails(raw);
      return;
    }
    setOnvifUrl(raw);
    applyOnvifCredentials(raw);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setMessage(null);
    setSaving(true);

    try {
      if (editingId) {
        const rawRtspUrl = rtspUrl.trim();
        const parsedRtsp = rawRtspUrl ? parseRtspUrl(rawRtspUrl) : null;
        if (rawRtspUrl && !parsedRtsp) {
          setMessage({ kind: "error", text: "Informe uma URL RTSP válida." });
          return;
        }
        const result = await window.api.cameras.update({
          id: editingId,
          name: name.trim(),
          host: host.trim() || parsedRtsp?.host || "",
          port: port ? Number(port) : (parsedRtsp?.port ?? null),
          onvifUrl: onvifUrl.trim() || null,
          rtspUrl: parsedRtsp?.sanitizedUrl ?? null,
          username: username.trim() || parsedRtsp?.username || null,
          password: password || parsedRtsp?.password || null,
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.error.message });
          return;
        }
        onSaved();
        return;
      }

      const rawRtspUrl = rtspUrl.trim();
      const parsedRtsp = rawRtspUrl ? parseRtspUrl(rawRtspUrl) : null;
      if (rawRtspUrl && !parsedRtsp) {
        setMessage({ kind: "error", text: "Informe uma URL RTSP válida." });
        return;
      }

      const result = await window.api.cameras.create({
        name: name.trim(),
        host: host.trim() || parsedRtsp?.host || "",
        port: port ? Number(port) : (parsedRtsp?.port ?? null),
        epr: initial?.epr ?? null,
        onvifUrl: onvifUrl.trim() || null,
        rtspUrl: parsedRtsp?.sanitizedUrl ?? null,
        username: username.trim() || parsedRtsp?.username || null,
        password: password || parsedRtsp?.password || null,
        allowDuplicate: duplicate,
      });

      if (!result.ok) {
        setMessage({ kind: "error", text: result.error.message });
        return;
      }

      if (result.value.duplicate && !duplicate) {
        setDuplicate(true);
        setMessage({
          kind: "info",
          text: "Uma câmera similar já existe. Confirme para salvar como cadastro separado.",
        });
        return;
      }

      setMessage({ kind: "success", text: "Câmera cadastrada com sucesso." });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (testing) return;
    const rawRtspUrl = rtspUrl.trim();
    const parsedRtsp = rawRtspUrl ? parseRtspUrl(rawRtspUrl) : null;
    if (rawRtspUrl && !parsedRtsp) {
      setMessage({ kind: "error", text: "Informe uma URL RTSP válida." });
      return;
    }

    setTesting(true);
    setMessage({ kind: "info", text: "Testando a conexão informada…" });
    try {
      const result = await window.api.cameras.testConnection({
        host: host.trim() || parsedRtsp?.host || "",
        port: port ? Number(port) : (parsedRtsp?.port ?? null),
        onvifUrl: onvifUrl.trim() || null,
        rtspUrl: parsedRtsp?.sanitizedUrl ?? null,
        username: username.trim() || parsedRtsp?.username || null,
        password: password || parsedRtsp?.password || null,
      });
      if (!result.ok) {
        setMessage({ kind: "error", text: result.error.message });
        return;
      }
      const details = result.value.segments
        .map((segment) => `${segment.name.toUpperCase()}: ${segment.detail}`)
        .join(" ");
      setMessage({
        kind: result.value.status === "connected" ? "success" : "error",
        text: details,
      });
    } finally {
      setTesting(false);
    }
  }

  /*
   * A URL RTSP can contain the host and credentials. Fields remain editable so
   * the operator can replace either source before saving.
   */

  return (
    <form
      className={`camera-form${editingId ? " camera-form-editing" : ""}`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="camera-form-columns">
        <section className="camera-form-column" aria-label="Dados da câmera">
          <div className="field">
            <label className="field-label" htmlFor="cam-name">
              Nome amigável
            </label>
            <input
              id="cam-name"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              autoFocus
            />
          </div>

          {editingId &&
            (initial?.manufacturer ||
              initial?.model ||
              initial?.serialNumber) && (
              <div
                className="camera-details-grid"
                aria-label="Informações do dispositivo"
              >
                {initial.manufacturer && (
                  <div className="camera-detail">
                    <span>Fabricante</span>
                    <strong>{initial.manufacturer}</strong>
                  </div>
                )}
                {initial.model && (
                  <div className="camera-detail">
                    <span>Modelo</span>
                    <strong>{initial.model}</strong>
                  </div>
                )}
                {initial.serialNumber && (
                  <div className="camera-detail">
                    <span>Número de série</span>
                    <strong>{initial.serialNumber}</strong>
                  </div>
                )}
              </div>
            )}

          <div className="field-row camera-form-address">
            <div className="field">
              <label className="field-label" htmlFor="cam-host">
                Endereço (IP ou hostname)
              </label>
              <input
                id="cam-host"
                className="field-input"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                required={!parseRtspUrl(rtspUrl)}
              />
            </div>
            <div className="field field-narrow">
              <label className="field-label" htmlFor="cam-port">
                Porta
              </label>
              <input
                id="cam-port"
                className="field-input"
                type="number"
                min={1}
                max={65_535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </div>
          </div>

          <div className="field-row camera-form-credentials">
            <div className="field">
              <label className="field-label" htmlFor="cam-user">
                Usuário
              </label>
              <input
                id="cam-user"
                className="field-input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="cam-pass">
                {editingId ? "Nova senha (deixe vazio para manter)" : "Senha"}
              </label>
              <input
                id="cam-pass"
                className="field-input"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="camera-form-column" aria-label="URLs da câmera">
          <div className="field">
            <label className="field-label" htmlFor="cam-rtsp">
              URL RTSP <span className="field-optional">Opcional</span>
            </label>
            <input
              id="cam-rtsp"
              className="field-input"
              placeholder="rtsp://camera/stream"
              value={rtspUrl}
              onChange={(event) => {
                setRtspUrl(event.target.value);
                applyRtspCredentials(event.target.value);
              }}
              onBlur={(event) => applyRtspDetails(event.target.value)}
            />
          </div>

          {editingId && (
            <div className="field">
              <label className="field-label" htmlFor="cam-rtsp-sub">
                URL RTSP secundária{" "}
                <span className="field-optional">Opcional</span>
              </label>
              <input
                id="cam-rtsp-sub"
                className="field-input"
                value={initial?.rtspSubUrl ?? ""}
                placeholder="Não configurada"
                readOnly
              />
            </div>
          )}

          <div className="field">
            <label className="field-label" htmlFor="cam-onvif">
              URL ONVIF <span className="field-optional">Opcional</span>
            </label>
            <input
              id="cam-onvif"
              className="field-input"
              placeholder="http://camera/onvif/device_service"
              value={onvifUrl}
              onChange={(event) => handleOnvifChange(event.target.value)}
              onBlur={(event) => applyOnvifDetails(event.target.value)}
            />
          </div>
        </section>
      </div>

      {message && (
        <div
          className={`form-message form-${message.kind} camera-form-message`}
        >
          {message.text}
        </div>
      )}

      <div className="modal-actions camera-form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          <CloseIcon size={16} />
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void handleTestConnection()}
          disabled={testing || saving}
        >
          <ActivityIcon size={16} />
          {testing ? "Testando…" : "Testar conexão"}
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <CheckIcon size={16} />
          {saving
            ? "Salvando…"
            : editingId
              ? "Salvar alterações"
              : duplicate
                ? "Confirmar cadastro"
                : "Cadastrar câmera"}
        </button>
      </div>
    </form>
  );
}
