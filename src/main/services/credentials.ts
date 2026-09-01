import type { DatabaseSupervisor } from "../supervisors/database.js";
import { Vault, type MasterKeyStore } from "../security/vault.js";
import type { EncryptedCredential } from "../../shared/database.js";

const MASTER_KEY_PREFERENCE = "credentials.master-key.v1";

export type CredentialInput = {
  service: string;
  username?: string | null;
  password: string;
};

export interface DecryptedCredential {
  username: string | null;
  password: string;
}

function decodeCredential(value: string): DecryptedCredential {
  try {
    const parsed = JSON.parse(value) as Partial<DecryptedCredential> & {
      version?: unknown;
    };
    if (
      parsed.version === 1 &&
      typeof parsed.password === "string" &&
      (typeof parsed.username === "string" || parsed.username === null)
    ) {
      return { username: parsed.username, password: parsed.password };
    }
  } catch {
    // Credenciais anteriores armazenavam somente a senha como texto cifrado.
  }
  return { username: null, password: value };
}

export class CredentialService {
  private readonly vault: Vault;

  constructor(
    private readonly database: DatabaseSupervisor,
    keyStore: MasterKeyStore,
  ) {
    this.vault = new Vault(keyStore);
  }

  async initialize(): Promise<{ available: boolean }> {
    if (!this.vault.isAvailable) return { available: false };

    const storedKey = await this.database.request("preference.get", {
      key: MASTER_KEY_PREFERENCE,
    });
    if (!storedKey.ok) {
      throw new Error(
        "Não foi possível carregar a chave de proteção das credenciais.",
      );
    }

    if (typeof storedKey.value === "string" && storedKey.value.length > 0) {
      try {
        this.vault.setMasterKey(
          this.vault.unwrapMasterKey(Buffer.from(storedKey.value, "base64")),
        );
      } catch {
        throw new Error(
          "As credenciais salvas não podem ser abertas neste perfil. Informe-as novamente.",
        );
      }
      return { available: true };
    }

    await this.vault.initialize();
    const savedKey = await this.database.request("preference.set", {
      key: MASTER_KEY_PREFERENCE,
      value: this.vault.wrappedMasterKey().toString("base64"),
    });
    if (!savedKey.ok) {
      throw new Error("Não foi possível proteger as credenciais neste perfil.");
    }
    return { available: true };
  }

  get isAvailable(): boolean {
    return this.vault.isAvailable;
  }

  private async requireVault(): Promise<void> {
    if (!this.vault.isAvailable || !this.vault.hasMasterKey()) {
      throw new Error(
        "safeStorage indisponível: persistência de credenciais bloqueada.",
      );
    }
  }

  async setCredential(
    cameraId: string,
    input: CredentialInput,
  ): Promise<{ stored: true }> {
    await this.requireVault();
    const credential = this.vault.encrypt(
      JSON.stringify({
        version: 1,
        username: input.username ?? null,
        password: input.password,
      }),
    );
    const response = await this.database.request("credential.set", {
      cameraId,
      service: input.service,
      ...credential,
    });
    if (!response.ok) {
      throw new Error("Não foi possível persistir a credencial.");
    }
    return { stored: true };
  }

  async getCredential(
    cameraId: string,
    service: string,
  ): Promise<string | null> {
    return (
      (await this.getCredentialDetails(cameraId, service))?.password ?? null
    );
  }

  async getCredentialDetails(
    cameraId: string,
    service: string,
  ): Promise<DecryptedCredential | null> {
    await this.requireVault();
    const response = await this.database.request("credential.get", {
      cameraId,
      service,
    });
    if (!response.ok) return null;
    const credential = response.value as EncryptedCredential;
    return decodeCredential(this.vault.decrypt(credential));
  }

  async hasCredential(cameraId: string): Promise<boolean> {
    const response = await this.database.request("credential.has", {
      cameraId,
    });
    return response.ok
      ? Boolean((response.value as { ready?: boolean }).ready ?? response.value)
      : false;
  }

  async listCredentialServices(cameraId: string): Promise<string[]> {
    const response = await this.database.request("credential.listServices", {
      cameraId,
    });
    return response.ok ? (response.value as string[]) : [];
  }

  async removeCredential(cameraId: string, service?: string): Promise<void> {
    await this.database.request("credential.remove", { cameraId, service });
  }

  async encryptedCredentialsForCamera(
    cameraId: string,
  ): Promise<Record<string, EncryptedCredential>> {
    const services = await this.listCredentialServices(cameraId);
    const entries = await Promise.all(
      services.map(async (service) => {
        const response = await this.database.request("credential.get", {
          cameraId,
          service,
        });
        return [
          service,
          response.ok ? (response.value as EncryptedCredential) : null,
        ] as const;
      }),
    );
    return Object.fromEntries(entries.filter(([, c]) => c !== null)) as Record<
      string,
      EncryptedCredential
    >;
  }
}
