import { networkInterfaces } from "node:os";
import type { NetworkInterfaceInfo } from "node:os";

export type InterfaceCategory =
  "ethernet" | "wifi" | "vpn" | "virtual" | "unknown";

export interface NetworkInterfaceEntry {
  name: string;
  category: InterfaceCategory;
  addresses: string[];
  mac: string | null;
  eligible: boolean;
}

export interface NetworkInterfaceFixture {
  name: string;
  address: string;
  netmask: string;
  family: "IPv4" | "IPv6";
  mac: string;
  internal?: boolean;
  cidr?: string | null;
}

const WIFI_PATTERNS = [/wi-?fi/i, /wireless/i, /wlan/i, /802\.11/i];
const ETHERNET_PATTERNS = [
  /ethernet/i,
  /^eth\d+/i,
  /^en\d+/i,
  /realtek/i,
  /lan/i,
  /gigabit/i,
];
const VPN_PATTERNS = [
  /vpn/i,
  /wireguard/i,
  /tailscale/i,
  /zerotier/i,
  /^tun\d*/i,
  /^tap\d*/i,
  /wintun/i,
  /^ppp/i,
];
const VIRTUAL_PATTERNS = [
  /virtual/i,
  /vmware/i,
  /virtualbox/i,
  /hyper-v/i,
  /vhdex/i,
  /docker/i,
  /loopback/i,
  /isatap/i,
  /teredo/i,
  /^lo$/i,
  /^ve?thernet/i,
  /vmswitch/i,
  /wsl/i,
];

function matchAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(name));
}

export function classifyInterface(name: string): InterfaceCategory {
  if (matchAny(name, VPN_PATTERNS)) return "vpn";
  if (matchAny(name, WIFI_PATTERNS)) return "wifi";
  if (matchAny(name, VIRTUAL_PATTERNS)) return "virtual";
  if (matchAny(name, ETHERNET_PATTERNS)) return "ethernet";
  return "unknown";
}

export function isLoopback(name: string, info: NetworkInterfaceInfo): boolean {
  return info.internal || /loopback|^lo$/i.test(name);
}

export function isEligible(name: string, info: NetworkInterfaceInfo): boolean {
  if (isLoopback(name, info)) return false;
  if (info.family !== "IPv4") return false;
  if (!info.address || info.address === "0.0.0.0") return false;
  if (/^169\.254\./.test(info.address)) return false;
  return true;
}

export function fromFixture(
  fixtures: NetworkInterfaceFixture[],
): NetworkInterfaceEntry[] {
  const entries: NetworkInterfaceEntry[] = [];
  for (const fixture of fixtures) {
    const name = fixture.name;
    const category = classifyInterface(name);
    const info: NetworkInterfaceInfo =
      fixture.family === "IPv6"
        ? {
            address: fixture.address,
            netmask: fixture.netmask,
            family: "IPv6",
            mac: fixture.mac,
            internal: fixture.internal ?? false,
            scopeid: 0,
            cidr: fixture.cidr ?? null,
          }
        : {
            address: fixture.address,
            netmask: fixture.netmask,
            family: "IPv4",
            mac: fixture.mac,
            internal: fixture.internal ?? false,
            cidr: fixture.cidr ?? null,
          };
    const existing = entries.find((entry) => entry.name === name);
    if (existing) {
      existing.addresses.push(fixture.address);
      continue;
    }
    entries.push({
      name,
      category,
      addresses: [fixture.address],
      mac: fixture.mac || null,
      eligible: isEligible(name, info),
    });
  }
  return entries;
}

export function enumerateInterfaces(): NetworkInterfaceEntry[] {
  const interfaces = networkInterfaces();
  const entries: NetworkInterfaceEntry[] = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    const category = classifyInterface(name);
    const addresses: string[] = [];
    let mac: string | null = null;
    let eligible = false;

    for (const info of infos ?? []) {
      if (info.family === "IPv4" && info.address) addresses.push(info.address);
      if (info.mac && info.mac !== "00:00:00:00:00:00") mac = info.mac;
      if (isEligible(name, info)) eligible = true;
    }

    entries.push({ name, category, addresses, mac, eligible });
  }

  return entries;
}

export function resolveInterfaceAddress(interfaceName: string): string | null {
  return resolveInterfaceAddressFromEntries(
    enumerateInterfaces(),
    interfaceName,
  );
}

export function resolveInterfaceAddressFromEntries(
  entries: NetworkInterfaceEntry[],
  interfaceName: string,
): string | null {
  const entry = entries.find((item) => item.name === interfaceName);
  if (!entry) return null;
  return (
    entry.addresses.find(
      (address) => !/^169\.254\./.test(address) && address !== "0.0.0.0",
    ) ?? null
  );
}
