import { describe, expect, it } from "vitest";
import {
  probeHttp,
  probeRtsp,
  type ProbeResult,
} from "../src/workers/camera/probes.js";

function fetchWith(status: number, delayMs = 0) {
  return async (
    _url: string,
    _init: RequestInit,
  ): Promise<{ status: number }> => {
    void _url;
    void _init;
    if (delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { status };
  };
}

describe("HTTP probe", () => {
  it("reports ok for a reachable endpoint", async () => {
    const result = await probeHttp({
      url: "http://cam.local/onvif/device_service",
      fetchImpl: fetchWith(200),
    });
    expect(result).toBe("ok");
  });

  it("reports auth_error with credentials on 401", async () => {
    const result = await probeHttp({
      url: "http://cam.local",
      username: "admin",
      password: "x",
      fetchImpl: fetchWith(401),
    });
    expect(result).toBe("auth_error");
  });

  it("reports unsupported on 401 without credentials", async () => {
    const result = await probeHttp({
      url: "http://cam.local",
      fetchImpl: fetchWith(401),
    });
    expect(result).toBe("unsupported");
  });

  it("reports unreachable for server errors", async () => {
    const result = await probeHttp({
      url: "http://cam.local",
      fetchImpl: fetchWith(500),
    });
    expect(result).toBe("unreachable");
  });

  it("reports timeout when the endpoint is slow", async () => {
    const result = await probeHttp({
      url: "http://cam.local",
      timeoutMs: 50,
      fetchImpl: async (_url, init) => {
        await new Promise((resolve) => {
          init.signal?.addEventListener("abort", () => resolve(null), {
            once: true,
          });
        });
        return { status: 200 };
      },
    });
    expect(result).toBe("timeout");
  });

  it("rejects non-HTTP URLs", async () => {
    await expect(
      probeHttp({ url: "rtsp://cam.local/stream", fetchImpl: fetchWith(200) }),
    ).rejects.toThrow();
  });
});

describe("RTSP probe", () => {
  it("reports ok for a valid RTSP response", async () => {
    const result = await probeRtsp({
      url: "rtsp://cam.local:554/stream",
      checkImpl: async () => "ok",
    });
    expect(result).toBe("ok");
  });

  it("reports auth_error when RTSP requires credentials", async () => {
    const result = await probeRtsp({
      url: "rtsp://cam.local/stream",
      username: "admin",
      password: "x",
      checkImpl: async () => "auth_error",
    });
    expect(result).toBe("auth_error");
  });

  it("reports unsupported for non-RTSP schemes", async () => {
    const result = await probeRtsp({
      url: "http://cam.local/stream",
      checkImpl: async () => "ok",
    });
    expect(result).toBe("unsupported");
  });

  it("propagates unreachable results", async () => {
    const result = await probeRtsp({
      url: "rtsp://cam.local/stream",
      checkImpl: async () => "unreachable",
    });
    expect(result).toBe("unreachable");
  });

  it("supports distinct credentials per service", async () => {
    let seenUrl = "";
    let seenUser: string | null | undefined;
    const result = await probeRtsp({
      url: "rtsp://cam.local/stream",
      username: "rtsp-user",
      password: "rtsp-pass",
      checkImpl: async (options) => {
        seenUrl = options.url.toString();
        seenUser = options.username;
        return "ok";
      },
    });
    expect(result).toBe("ok");
    expect(seenUrl).toContain("rtsp://cam.local/stream");
    expect(seenUser).toBe("rtsp-user");
  });

  it("handles invalid hostnames without throwing", async () => {
    const result = await probeRtsp({
      url: "rtsp://hostname-invalido.local/stream",
      checkImpl: async () => "unreachable" as ProbeResult,
    });
    expect(result).toBe("unreachable");
  });

  it("authenticates with Digest after a 401 challenge", async () => {
    const net = await import("node:net");
    const crypto = await import("node:crypto");
    let attempts = 0;
    const server = net.createServer((socket) => {
      socket.on("data", (chunk) => {
        const req = chunk.toString("utf8");
        attempts++;
        if (!req.includes("Authorization: Digest")) {
          socket.write(
            'RTSP/1.0 401 Unauthorized\r\nCSeq: 1\r\nWWW-Authenticate: Digest realm="cam",nonce="abc123"\r\n\r\n',
          );
          return;
        }
        const auth = /Authorization: Digest ([^\r\n]+)/.exec(req)?.[1] ?? "";
        const response = /response="([^"]+)"/.exec(auth)?.[1] ?? "";
        const uri = /uri="([^"]+)"/.exec(auth)?.[1] ?? "";
        const ha1 = crypto
          .createHash("md5")
          .update("admin:cam:senha")
          .digest("hex");
        const ha2 = crypto
          .createHash("md5")
          .update(`DESCRIBE:${uri}`)
          .digest("hex");
        const expected = crypto
          .createHash("md5")
          .update(`${ha1}:abc123:${ha2}`)
          .digest("hex");
        socket.write(
          response === expected
            ? "RTSP/1.0 200 OK\r\nCSeq: 2\r\nContent-Type: application/sdp\r\n\r\n"
            : "RTSP/1.0 403 Forbidden\r\nCSeq: 2\r\n\r\n",
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    try {
      const result = await probeRtsp({
        url: `rtsp://127.0.0.1:${port}/stream`,
        username: "admin",
        password: "senha",
        timeoutMs: 3000,
      });
      expect(result).toBe("ok");
      expect(attempts).toBeGreaterThanOrEqual(2);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);
});
