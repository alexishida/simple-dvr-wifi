import type { DatabaseSupervisor } from "../supervisors/database.js";
import type { CredentialService } from "./credentials.js";
import type { CameraRecord } from "../../shared/database.js";
import { parseHttpUrl, parseRtspUrl } from "../../shared/camera-urls.js";

export interface CameraDuplicateCheck {
  byAddress: CameraRecord | null;
  byEpr: CameraRecord | null;
  bySerial: CameraRecord | null;
}

export interface CameraCreateInput {
  name: string;
  host: string;
  port?: number | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  epr?: string | null;
  rtspUrl?: string | null;
  onvifUrl?: string | null;
  snapshotUri?: string | null;
  username?: string | null;
  password?: string | null;
  allowDuplicate?: boolean;
}

export interface CameraUpdateInput {
  name: string;
  host: string;
  port?: number | null;
  rtspUrl?: string | null;
  onvifUrl?: string | null;
  username?: string | null;
  password?: string | null;
}

export class CameraManagementService {
  constructor(
    private readonly database: DatabaseSupervisor,
    private readonly credentials: CredentialService,
  ) {}

  async checkDuplicates(input: {
    host?: string;
    epr?: string | null;
    serialNumber?: string | null;
  }): Promise<CameraDuplicateCheck> {
    const [byAddress, byEpr, bySerial] = await Promise.all([
      input.host
        ? this.requestCamera("camera.findByHost", { host: input.host })
        : Promise.resolve(null),
      input.epr
        ? this.requestCamera("camera.findByEpr", { epr: input.epr })
        : Promise.resolve(null),
      input.serialNumber
        ? this.requestCamera("camera.findBySerial", {
            serialNumber: input.serialNumber,
          })
        : Promise.resolve(null),
    ]);
    return { byAddress, byEpr, bySerial };
  }

  private async requestCamera(
    channel: string,
    payload: unknown,
  ): Promise<CameraRecord | null> {
    const response = await this.database.request(channel, payload);
    if (!response.ok || response.value === null) return null;
    return response.value as CameraRecord;
  }

  async create(
    input: CameraCreateInput,
  ): Promise<{ camera: CameraRecord; duplicate: boolean }> {
    const parsedRtsp = input.rtspUrl ? parseRtspUrl(input.rtspUrl) : null;
    if (input.rtspUrl && !parsedRtsp) {
      throw new Error("URL RTSP inválida.");
    }
    const parsedOnvif = input.onvifUrl ? parseHttpUrl(input.onvifUrl) : null;
    if (input.onvifUrl && !parsedOnvif) throw new Error("URL ONVIF inválida.");
    const parsedSnapshot = input.snapshotUri
      ? parseHttpUrl(input.snapshotUri)
      : null;
    if (input.snapshotUri && !parsedSnapshot)
      throw new Error("URL de snapshot inválida.");
    const rtspUrl = parsedRtsp?.sanitizedUrl ?? null;
    const credentialUsername =
      input.username ||
      parsedRtsp?.username ||
      parsedOnvif?.username ||
      parsedSnapshot?.username ||
      null;
    const credentialPassword =
      input.password ||
      parsedRtsp?.password ||
      parsedOnvif?.password ||
      parsedSnapshot?.password ||
      null;

    const duplicates = await this.checkDuplicates({
      host: input.host,
      epr: input.epr,
      serialNumber: input.serialNumber,
    });
    const blocked = Boolean(
      duplicates.byAddress || duplicates.byEpr || duplicates.bySerial,
    );

    if (blocked && !input.allowDuplicate) {
      return {
        camera:
          duplicates.byAddress ?? duplicates.byEpr ?? duplicates.bySerial!,
        duplicate: true,
      };
    }

    const endpoints = [];
    if (parsedOnvif)
      endpoints.push({ service: "onvif", url: parsedOnvif.sanitizedUrl });
    if (rtspUrl) endpoints.push({ service: "rtsp", url: rtspUrl });
    if (parsedSnapshot)
      endpoints.push({ service: "snapshot", url: parsedSnapshot.sanitizedUrl });

    const response = await this.database.request("camera.create", {
      name: input.name,
      host: input.host,
      port: input.port ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      epr: input.epr ?? null,
      endpoints,
    });
    if (!response.ok) {
      throw new Error("Não foi possível cadastrar a câmera.");
    }
    let camera = response.value as CameraRecord;

    if (credentialUsername && credentialPassword) {
      try {
        await this.credentials.setCredential(camera.id, {
          service: "onvif",
          username: credentialUsername,
          password: credentialPassword,
        });
        if (rtspUrl) {
          await this.credentials.setCredential(camera.id, {
            service: "rtsp",
            username: credentialUsername,
            password: credentialPassword,
          });
        }
        if (parsedSnapshot) {
          await this.credentials.setCredential(camera.id, {
            service: "snapshot",
            username: credentialUsername,
            password: credentialPassword,
          });
        }
      } catch (error) {
        await this.credentials.removeCredential(camera.id);
        await this.database.request("camera.remove", { id: camera.id });
        throw error;
      }
    }

    if (rtspUrl || parsedOnvif || parsedSnapshot) {
      await this.database.request("camera.setStatus", {
        cameraId: camera.id,
        status: "disconnected",
      });
      camera =
        (await this.requestCamera("camera.get", { id: camera.id })) ?? camera;
    }

    return { camera, duplicate: false };
  }

  async updateCredentials(
    cameraId: string,
    input: {
      username?: string | null;
      password?: string | null;
      rtspPassword?: string | null;
    },
  ): Promise<void> {
    const username = input.username?.trim() || null;
    if (input.password) {
      const current = await this.currentCredential(cameraId, "onvif", "rtsp");
      await this.credentials.setCredential(cameraId, {
        service: "onvif",
        username: username ?? current?.username,
        password: input.password,
      });
    }
    if (input.rtspPassword) {
      const current = await this.currentCredential(cameraId, "rtsp", "onvif");
      await this.credentials.setCredential(cameraId, {
        service: "rtsp",
        username: username ?? current?.username,
        password: input.rtspPassword,
      });
    }
  }

  private async currentCredential(
    cameraId: string,
    primaryService: string,
    fallbackService: string,
  ): Promise<{ username: string | null } | null> {
    try {
      return (
        (await this.credentials.getCredentialDetails(
          cameraId,
          primaryService,
        )) ??
        (await this.credentials.getCredentialDetails(cameraId, fallbackService))
      );
    } catch {
      return null;
    }
  }

  async updateAddress(
    cameraId: string,
    input: { host?: string; port?: number | null },
  ): Promise<CameraRecord | null> {
    const response = await this.database.request("camera.update", {
      id: cameraId,
      host: input.host ?? undefined,
      port: input.port ?? null,
    });
    if (!response.ok) return null;
    return response.value as CameraRecord;
  }

  async update(
    cameraId: string,
    input: CameraUpdateInput,
  ): Promise<CameraRecord | null> {
    const parsedRtsp = input.rtspUrl ? parseRtspUrl(input.rtspUrl) : null;
    if (input.rtspUrl && !parsedRtsp) throw new Error("URL RTSP inválida.");
    const parsedOnvif = input.onvifUrl ? parseHttpUrl(input.onvifUrl) : null;
    if (input.onvifUrl && !parsedOnvif) throw new Error("URL ONVIF inválida.");

    const camera = await this.updateAddress(cameraId, {
      host: input.host.trim() || parsedRtsp?.host,
      port: input.port ?? parsedRtsp?.port ?? null,
    });
    if (!camera) return null;
    const response = await this.database.request("camera.update", {
      id: cameraId,
      name: input.name.trim(),
    });
    if (!response.ok) return null;

    if (parsedOnvif) {
      await this.database.request("camera.setEndpoint", {
        cameraId,
        service: "onvif",
        url: parsedOnvif.sanitizedUrl,
      });
    }
    if (parsedRtsp) {
      await this.database.request("camera.setEndpoint", {
        cameraId,
        service: "rtsp",
        url: parsedRtsp.sanitizedUrl,
      });
    }
    if (input.password) {
      await this.updateCredentials(cameraId, {
        username: input.username ?? null,
        password: input.password,
        rtspPassword: input.password,
      });
    } else if (input.username?.trim()) {
      const current =
        (await this.credentials.getCredentialDetails(cameraId, "onvif")) ??
        (await this.credentials.getCredentialDetails(cameraId, "rtsp"));
      if (current) {
        await this.updateCredentials(cameraId, {
          username: input.username,
          password: current.password,
          rtspPassword: current.password,
        });
      }
    }
    return (await this.requestCamera("camera.get", { id: cameraId })) ?? null;
  }

  async deactivate(cameraId: string): Promise<boolean> {
    const response = await this.database.request("camera.deactivate", {
      id: cameraId,
    });
    return response.ok;
  }

  async reactivate(cameraId: string): Promise<boolean> {
    const response = await this.database.request("camera.activate", {
      id: cameraId,
    });
    return response.ok;
  }

  async remove(
    cameraId: string,
  ): Promise<{ removed: boolean; credentialsRemoved: boolean }> {
    const response = await this.database.request("camera.remove", {
      id: cameraId,
    });
    return { removed: response.ok, credentialsRemoved: response.ok };
  }
}
