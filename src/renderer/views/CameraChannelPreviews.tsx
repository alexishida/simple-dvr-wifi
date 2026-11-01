import { useEffect, useState } from "react";
import type { CameraChannel } from "../../shared/camera-channels.js";
import { CameraIcon } from "../icons.js";

export function CameraChannelPreviews({ channels, username, password }: {
  channels: CameraChannel[];
  username: string;
  password: string;
}): React.JSX.Element {
  const [previews, setPreviews] = useState<Record<string, { image?: string; failed?: boolean }>>({});
  useEffect(() => {
    let cancelled = false;
    setPreviews({});
    void (async () => {
      for (const channel of channels) {
        if (cancelled) return;
        try {
          const result = await window.api.cameras.preview({
            rtspUrl: channel.rtspSubUrl ?? channel.rtspUrl,
            username: username || null,
            password: password || null,
          });
          if (cancelled) return;
          setPreviews((current) => ({ ...current, [channel.key]: result.ok ? { image: result.value.image } : { failed: true } }));
        } catch {
          if (cancelled) return;
          setPreviews((current) => ({ ...current, [channel.key]: { failed: true } }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [channels, username, password]);

  return (
    <div className="camera-channel-previews" aria-label="Previas dos canais detectados">
      {channels.map((channel) => (
        <figure className="camera-channel-preview" key={channel.key}>
          {previews[channel.key]?.image ? (
            <img src={previews[channel.key]!.image} alt={`Imagem de ${channel.name}`} />
          ) : (
            <div className="camera-channel-preview-placeholder" role="status">
              <CameraIcon size={24} />
              <span>{previews[channel.key]?.failed ? "Previa indisponivel; voce pode continuar o cadastro." : "Obtendo imagem do canal..."}</span>
            </div>
          )}
          <figcaption>
            <strong>{channel.name}</strong>
            <span>{channel.rtspSubUrl ? "Principal e lite disponiveis" : "Principal disponivel; lite nao encontrado"}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
