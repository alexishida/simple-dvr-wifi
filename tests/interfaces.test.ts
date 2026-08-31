import { describe, expect, it } from "vitest";
import {
  classifyInterface,
  enumerateInterfaces,
  fromFixture,
  isEligible,
  resolveInterfaceAddressFromEntries,
  type NetworkInterfaceFixture,
} from "../src/workers/discovery/interfaces.js";

const WINDOWS_FIXTURES: NetworkInterfaceFixture[] = [
  {
    name: "Ethernet",
    address: "192.168.1.10",
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:11:22:33:44:55",
  },
  {
    name: "Wi-Fi",
    address: "10.0.0.5",
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "AA:BB:CC:DD:EE:FF",
  },
  {
    name: "vEthernet (WSL)",
    address: "172.20.0.1",
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:15:5D:00:00:01",
  },
  {
    name: "Tailscale",
    address: "100.64.0.1",
    netmask: "255.192.0.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
  },
  {
    name: "Loopback Pseudo-Interface 1",
    address: "127.0.0.1",
    netmask: "255.0.0.0",
    family: "IPv4",
    mac: "",
  },
  {
    name: "Ethernet",
    address: "fe80::1",
    netmask: "ffff:ffff::",
    family: "IPv6",
    mac: "00:11:22:33:44:55",
  },
  {
    name: "Wi-Fi",
    address: "169.254.10.5",
    netmask: "255.255.0.0",
    family: "IPv4",
    mac: "AA:BB:CC:DD:EE:FF",
  },
];

describe("network interface enumeration", () => {
  it("classifies Windows interfaces by category", () => {
    expect(classifyInterface("Ethernet")).toBe("ethernet");
    expect(classifyInterface("Wi-Fi")).toBe("wifi");
    expect(classifyInterface("Wireless LAN adapter")).toBe("wifi");
    expect(classifyInterface("Tailscale")).toBe("vpn");
    expect(classifyInterface("vEthernet (WSL)")).toBe("virtual");
    expect(classifyInterface("Loopback Pseudo-Interface 1")).toBe("virtual");
  });

  it("marks loopback, APIPA and non-IPv4 as ineligible", () => {
    const entries = fromFixture(WINDOWS_FIXTURES);
    const ethernet = entries.find((e) => e.name === "Ethernet");
    expect(ethernet?.eligible).toBe(true);
    const loopback = entries.find((e) => e.name.startsWith("Loopback"));
    expect(loopback?.eligible).toBe(false);
    expect(
      isEligible("Wi-Fi", {
        address: "169.254.10.5",
        netmask: "255.255.0.0",
        family: "IPv4",
        mac: "AA",
        internal: false,
        cidr: null,
      }),
    ).toBe(false);
  });

  it("merges multiple addresses per interface", () => {
    const entries = fromFixture(WINDOWS_FIXTURES);
    const ethernet = entries.find((e) => e.name === "Ethernet");
    expect(ethernet?.addresses).toContain("192.168.1.10");
    expect(ethernet?.addresses).toContain("fe80::1");
  });

  it("excludes interfaces with no valid IPv4", () => {
    const entries = fromFixture([
      {
        name: "Ethernet",
        address: "fe80::1",
        netmask: "ffff::",
        family: "IPv6",
        mac: "",
      },
    ]);
    expect(entries[0]?.eligible).toBe(false);
  });

  it("enumerates real interfaces without throwing", () => {
    const entries = enumerateInterfaces();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe("resolveInterfaceAddressFromEntries", () => {
  it("returns the first valid IPv4 address of the interface", () => {
    const entries = fromFixture(WINDOWS_FIXTURES);
    expect(resolveInterfaceAddressFromEntries(entries, "Ethernet")).toBe(
      "192.168.1.10",
    );
    expect(resolveInterfaceAddressFromEntries(entries, "Wi-Fi")).toBe(
      "10.0.0.5",
    );
  });

  it("skips APIPA addresses when selecting", () => {
    const entries = fromFixture([
      {
        name: "Ethernet",
        address: "169.254.10.5",
        netmask: "255.255.0.0",
        family: "IPv4",
        mac: "AA",
      },
      {
        name: "Ethernet",
        address: "192.168.1.10",
        netmask: "255.255.255.0",
        family: "IPv4",
        mac: "AA",
      },
    ]);
    expect(resolveInterfaceAddressFromEntries(entries, "Ethernet")).toBe(
      "192.168.1.10",
    );
  });

  it("returns null for an unknown interface", () => {
    expect(
      resolveInterfaceAddressFromEntries(
        fromFixture(WINDOWS_FIXTURES),
        "Inexistente",
      ),
    ).toBeNull();
  });
});
