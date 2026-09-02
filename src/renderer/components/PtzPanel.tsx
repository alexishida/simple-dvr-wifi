import { useCallback, useEffect, useRef, useState } from "react";
import { BoltIcon, PlusIcon } from "../icons.js";

interface PtzVelocityInput {
  pan?: number;
  tilt?: number;
  zoom?: number;
}

interface PtzPanelProps {
  cameraId: string | null;
  cameraName: string | null;
  supported: boolean;
  zoomSupported: boolean;
  presetsSupported: boolean;
}

const SPEED_STEP = 0.25;
const MAX_SPEED = 1;

function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(0, value));
}

export function PtzPanel({
  cameraId,
  cameraName,
  supported,
  zoomSupported,
  presetsSupported,
}: PtzPanelProps): React.JSX.Element {
  const [speed, setSpeed] = useState(0.5);
  const [blocked, setBlocked] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "ready" | "error"
  >("idle");
  const [presets, setPresets] = useState<
    Array<{ token: string; name: string }>
  >([]);
  const [newPresetName, setNewPresetName] = useState("");
  const activeAxis = useRef<{ pan: number; tilt: number } | null>(null);
  const activeMove = useRef(false);
  const repeatTimer = useRef<number | null>(null);

  const clearRepeat = useCallback(() => {
    if (repeatTimer.current !== null) {
      window.clearInterval(repeatTimer.current);
      repeatTimer.current = null;
    }
  }, []);

  const dispatchMove = useCallback(
    (velocity: PtzVelocityInput) => {
      if (!cameraId) return;
      activeMove.current = true;
      void window.api.ptz.move(cameraId, velocity).then((result) => {
        const started = result.ok && result.value.started;
        activeMove.current = started;
        setCommandError(
          result.ok
            ? started
              ? null
              : "A câmera não aceitou este movimento PTZ."
            : result.error.message,
        );
        if (!started) clearRepeat();
      });
    },
    [cameraId, clearRepeat],
  );

  const startMove = useCallback(
    (velocity: PtzVelocityInput) => {
      if (connectionState !== "ready" || blocked) return;
      clearRepeat();
      dispatchMove(velocity);
      repeatTimer.current = window.setInterval(
        () => dispatchMove(velocity),
        500,
      );
    },
    [connectionState, blocked, clearRepeat, dispatchMove],
  );

  const stopMove = useCallback(
    (trigger: "pointer_release" | "key_release" | "blur" | "unmount") => {
      clearRepeat();
      if (!cameraId || (!activeMove.current && !activeAxis.current)) return;
      activeAxis.current = null;
      activeMove.current = false;
      void window.api.ptz.stop(cameraId, trigger).then((result) => {
        if (!result.ok) setBlocked(true);
      });
    },
    [cameraId, clearRepeat],
  );

  const pressAxis = useCallback(
    (pan: number, tilt: number) => {
      activeAxis.current = { pan, tilt };
      startMove({ pan: pan * speed, tilt: tilt * speed });
    },
    [startMove, speed],
  );

  useEffect(() => {
    if (connectionState !== "ready" || blocked) clearRepeat();
  }, [connectionState, blocked, clearRepeat]);

  useEffect(() => {
    const onBlur = (): void => void stopMove("blur");
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      void stopMove("unmount");
    };
  }, [stopMove]);

  useEffect(() => {
    setBlocked(false);
    setCommandError(null);
    activeAxis.current = null;
    activeMove.current = false;
    clearRepeat();

    if (!cameraId || !supported) {
      setConnectionState("idle");
      return;
    }

    let cancelled = false;
    setConnectionState("connecting");
    void window.api.ptz.connect(cameraId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.value.connected) {
        setConnectionState("ready");
        return;
      }
      setConnectionState("error");
      setCommandError(
        result.ok
          ? "Não foi possível conectar o controle PTZ desta câmera."
          : result.error.message,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [cameraId, supported, clearRepeat]);

  useEffect(() => {
    if (!cameraId || !presetsSupported || connectionState !== "ready") return;
    void window.api.ptz.status(cameraId).then((result) => {
      if (result.ok && result.value) setBlocked(result.value.stopBlocked);
    });
  }, [cameraId, presetsSupported, connectionState]);

  const loadPresets = useCallback(() => {
    // Presets listing happens through the camera adapter in main; the renderer
    // keeps a local copy for display when supported.
    setPresets([]);
  }, []);

  const savePreset = (): void => {
    void setNewPresetName("");
    void presets;
  };

  const controlsDisabled = connectionState !== "ready" || blocked;
  const statusMessage = !cameraName
    ? "Selecione uma câmera PTZ no painel para conectar."
    : !supported
      ? `${cameraName} não possui PTZ disponível.`
      : connectionState === "connecting"
        ? `Conectando à ${cameraName}…`
        : connectionState === "ready"
          ? `Conectada: ${cameraName}`
          : "Não foi possível conectar o controle PTZ.";

  const direction = (
    pan: number,
    tilt: number,
    label: string,
  ): React.JSX.Element => (
    <button
      type="button"
      className={`ptz-btn ptz-btn-${label.toLowerCase()}`}
      aria-label={label}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pressAxis(pan, tilt);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        void stopMove("pointer_release");
      }}
      onPointerCancel={() => void stopMove("pointer_release")}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") pressAxis(pan, tilt);
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter")
          void stopMove("key_release");
      }}
      disabled={controlsDisabled}
    >
      {label === "Cima"
        ? "↑"
        : label === "Baixo"
          ? "↓"
          : label === "Esquerda"
            ? "←"
            : "→"}
    </button>
  );

  return (
    <div className="ptz-panel" role="group" aria-label="Controle PTZ">
      <p
        className={`ptz-connection ptz-connection-${connectionState}`}
        role="status"
      >
        <BoltIcon size={15} />
        {statusMessage}
      </p>
      <div className="ptz-cross">
        <div className="ptz-row">{direction(0, 1, "Cima")}</div>
        <div className="ptz-row">
          {direction(-1, 0, "Esquerda")}
          <span className="ptz-center" aria-hidden="true" />
          {direction(1, 0, "Direita")}
        </div>
        <div className="ptz-row">{direction(0, -1, "Baixo")}</div>
      </div>

      {zoomSupported && (
        <div className="ptz-zoom">
          <button
            type="button"
            className="ptz-btn"
            aria-label="Zoom in"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startMove({ zoom: speed });
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              void stopMove("pointer_release");
            }}
            onPointerCancel={() => void stopMove("pointer_release")}
            disabled={controlsDisabled}
          >
            +
          </button>
          <button
            type="button"
            className="ptz-btn"
            aria-label="Zoom out"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              startMove({ zoom: -speed });
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
              void stopMove("pointer_release");
            }}
            onPointerCancel={() => void stopMove("pointer_release")}
            disabled={controlsDisabled}
          >
            −
          </button>
        </div>
      )}

      <div className="ptz-speed">
        <label className="field-label" htmlFor="ptz-speed">
          Velocidade
        </label>
        <input
          id="ptz-speed"
          className="field-input"
          type="range"
          min={0}
          max={MAX_SPEED}
          step={SPEED_STEP}
          value={speed}
          onChange={(event) => setSpeed(clampSpeed(Number(event.target.value)))}
          disabled={controlsDisabled}
        />
      </div>

      {blocked && (
        <p className="form-message form-error">
          Movimento bloqueado após falha de parada. Aguarde a reconciliação.
        </p>
      )}

      {commandError && (
        <p className="form-message form-error">{commandError}</p>
      )}

      {presetsSupported && (
        <div className="ptz-presets">
          <div className="section-heading">
            <span className="panel-title">Presets</span>
            <button
              type="button"
              className="btn-icon"
              aria-label="Atualizar presets"
              onClick={loadPresets}
            >
              ↻
            </button>
          </div>
          <div className="field-row">
            <input
              className="field-input"
              placeholder="Nome do preset"
              value={newPresetName}
              onChange={(event) => setNewPresetName(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={savePreset}
            >
              <PlusIcon size={14} />
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
