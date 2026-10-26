import { CheckIcon, CloseIcon, SearchIcon } from "../icons.js";

interface CameraNoticeProps {
  kind: "info" | "success" | "error";
  text: string;
  title?: string;
  busy?: boolean;
}

export function CameraNotice({ kind, text, title, busy = false }: CameraNoticeProps): React.JSX.Element {
  return (
    <div
      className={`camera-notice camera-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <span className="camera-notice-icon" aria-hidden="true">
        {busy ? <span className="camera-notice-spinner" /> : kind === "error" ? <CloseIcon size={18} /> : kind === "success" ? <CheckIcon size={18} /> : <SearchIcon size={18} />}
      </span>
      <div className="camera-notice-content">
        <strong>{title ?? (busy ? "Verificando conexão" : kind === "error" ? "Não foi possível concluir" : kind === "success" ? "Conexão confirmada" : "Resultado da verificação")}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}
