/**
 * Cross-platform reachability helpers.
 *
 * The playground is developed in Termux on Android but has to work on Windows,
 * macOS, Linux, WSL and inside Docker, so the access banner lists every
 * interface the server is actually reachable on instead of assuming
 * `localhost` works everywhere.
 */
import os from 'node:os';
import process from 'node:process';

import { C } from './logger';

export type AccessUrl = { url: string; label: string };

const WILDCARD_HOSTS = ['0.0.0.0', '::', '[::]'];

export const LOOPBACK_LABEL = 'this machine';
export const TERMUX_LABEL = 'termux loopback';
export const EMULATOR_LABEL = 'android emulator host loopback';
export const LAN_LABEL = 'local network';
export const LINK_LOCAL_LABEL = 'ipv6 link-local';
export const GLOBAL_IPV6_LABEL = 'ipv6';

/** The Android emulator reaches the host loopback through 10.0.2.2. */
export const ANDROID_EMULATOR_HOST = '10.0.2.2';

function isWildcardHost(host: string): boolean {
  return WILDCARD_HOSTS.indexOf(host) !== -1;
}

/** Termux (and the Android app it ships with) always runs on an Android host. */
function isTermux(): boolean {
  if (process.env.TERMUX_VERSION) return true;
  const prefix = process.env.PREFIX ?? '';
  return prefix.indexOf('com.termux') !== -1;
}

/** 169.254.0.0/16 is link-local IPv4: unroutable from a phone on wifi. */
function isUsefulIpv4(address: string): boolean {
  return address.indexOf('169.254.') !== 0;
}

/** Link-local (fe80::) and global unicast only; no unique-local or multicast. */
function isUsefulIpv6(address: string): boolean {
  if (address === '::' || address === '::1') return false;
  if (address.indexOf('fe80:') === 0) return true;
  return !/^f[cd]/.test(address) && address.indexOf('ff') !== 0;
}

/**
 * IPv6 literals in a URL need brackets, and a link-local address additionally
 * needs a zone id whose separator is percent encoded:
 * `http://[fe80::1%25wlan0]:3000`.
 */
function formatIpv6(address: string, port: number, zone: string): string {
  // `%` separates address from zone id and must itself be percent encoded.
  const zoned = zone ? `${address}%25${encodeURIComponent(zone)}` : address;
  return `http://[${zoned}]:${port}`;
}

export function collectAccessUrls(port: number, host: string): AccessUrl[] {
  const urls: AccessUrl[] = [];

  // A specific bind address is the only one the caller can rely on.
  if (host && !isWildcardHost(host)) {
    const literal = host.indexOf(':') !== -1 ? `[${host}]` : host;
    return [{ url: `http://${literal}:${port}`, label: LAN_LABEL }];
  }

  const interfaces = os.networkInterfaces();
  Object.keys(interfaces).forEach(name => {
    const addresses = interfaces[name] ?? [];
    addresses.forEach(entry => {
      if (entry.internal) return;
      // `family` is the string 'IPv4' / 'IPv6' on current Node, but older
      // type definitions described it as the number 4 / 6.
      const family = String(entry.family);
      if (family === 'IPv4' || family === '4') {
        if (!isUsefulIpv4(entry.address)) return;
        urls.push({
          url: `http://${entry.address}:${port}`,
          label: LAN_LABEL,
        });
        return;
      }
      if (family === 'IPv6' || family === '6') {
        if (!isUsefulIpv6(entry.address)) return;
        urls.push({
          url: formatIpv6(entry.address, port, name),
          label:
            entry.address.indexOf('fe80:') === 0
              ? LINK_LOCAL_LABEL
              : GLOBAL_IPV6_LABEL,
        });
      }
    });
  });

  urls.push({ url: `http://localhost:${port}`, label: LOOPBACK_LABEL });
  if (isTermux()) {
    urls.push({ url: `http://127.0.0.1:${port}`, label: TERMUX_LABEL });
  }
  // Always offered: .env.template tells emulator users to point at 10.0.2.2.
  urls.push({
    url: `http://${ANDROID_EMULATOR_HOST}:${port}`,
    label: EMULATOR_LABEL,
  });

  return urls;
}

// Wide enough for a zoned global IPv6 literal
// (`http://[2400:9800:47:57da:18d9:54fa:ac01:4030%25ccmni0]:3000` is 58 chars).
const BANNER_WIDTH = 72;

/** `line` is an already-assembled horizontal rule; only colourise it. */
function rule(line: string): string {
  return C.gray + line + C.reset;
}

export function formatAccessBanner(urls: AccessUrl[]): string {
  const lines: string[] = [];
  lines.push(rule('┌' + '─'.repeat(BANNER_WIDTH - 2) + '┐'));
  const title = ' Plugin playground is listening ';
  lines.push(
    `${C.gray}│${C.reset}${C.bold}${C.cyan}${title}${C.reset}${' '.repeat(
      Math.max(0, BANNER_WIDTH - 2 - title.length),
    )}${C.gray}│${C.reset}`,
  );
  lines.push(rule('├' + '─'.repeat(BANNER_WIDTH - 2) + '┤'));

  // Group by label so the same kind of address stays together.
  const labels: string[] = [];
  urls.forEach(entry => {
    if (labels.indexOf(entry.label) === -1) labels.push(entry.label);
  });

  labels.forEach(label => {
    const heading = ` ${label} `;
    lines.push(
      `${C.gray}│${C.reset} ${C.bold}${C.magenta}${heading}${C.reset}${' '.repeat(
        Math.max(0, BANNER_WIDTH - 3 - heading.length),
      )}${C.gray}│${C.reset}`,
    );
    urls.forEach(entry => {
      if (entry.label !== label) return;
      const row = `   ${C.green}${entry.url}${C.reset}`;
      const visible = `   ${entry.url}`;
      lines.push(
        `${C.gray}│${C.reset}${row}${' '.repeat(
          Math.max(0, BANNER_WIDTH - 2 - visible.length),
        )}${C.gray}│${C.reset}`,
      );
    });
  });

  lines.push(rule('└' + '─'.repeat(BANNER_WIDTH - 2) + '┘'));
  return lines.join('\n');
}
