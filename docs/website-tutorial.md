# Testing Website Tutorial

A comprehensive guide to testing your LNReader plugins using the web interface.

## Getting Started

1. **Start the development server:**

   ```bash
   npm run dev:start
   ```

2. **Open your browser:**
   Navigate to [localhost:3000](http://localhost:3000)

3. **Select a plugin:**
   Use the dropdown in the top navigation bar to select the plugin you want to test.

The server prints every address it is reachable on when it starts, so you do not
have to guess which one to use. See [Choosing an address](#choosing-an-address).

### Port and host flags

Both the dev server and the production server accept `--port` and `--host`:

```bash
npm run dev:start -- --port 4000
npm start -- --host 127.0.0.1 --port 4000
```

`--host` is useful when you want to restrict the server to a single interface
(for example `127.0.0.1` to keep it off your network).

## Choosing an address

The startup banner groups the addresses by kind. The ones you are most likely to
need:

| Situation | Address |
| --- | --- |
| Same machine | `http://localhost:3000` |
| Another device on the same Wi-Fi | the `local network` entry, e.g. `http://192.168.0.102:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Docker container | run with `--host 0.0.0.0` and use the host's IP |

### Opening it on a phone or tablet

The layout adapts to the viewport, and the sidebar collapses into a drawer
behind a hamburger button on narrow screens.

- **Android emulator:** the host machine is reachable at `10.0.2.2`, so use
  `http://10.0.2.2:3000`.
- **Physical phone on the same Wi-Fi:** use the `local network` address. The
  phone and the computer must be on the same network, and the firewall has to
  allow inbound connections on the port.
- **iOS simulator:** it shares the host's loopback, so `http://localhost:3000`
  works.
- **Notch and gesture-navy devices:** the page uses `viewport-fit=cover` and
  pads its headers and sheets with `env(safe-area-inset-*)`, so nothing is
  hidden behind a cutout or the home indicator.

## Production build

Development uses Vite. For anything closer to what users get, build once and
serve the bundle without Vite:

```bash
npm run build:web   # writes dist/client and dist/ssr
npm start           # serves the built bundle on port 3000
```

`npm run preview` does both in one step. The production server is a plain Node
process, so it boots the same way on Windows, macOS, Linux, WSL, Docker and
Termux.

Both modes serve the same three surfaces, so nothing about your workflow
changes:

- `/` - the playground UI
- `/api/*` - the REST API used by the plugin CLI tester
- `/https://...` and `/http://...` - the same-origin proxy

The proxy is what lets the browser talk to plugin sites directly. In the
browser a plugin's `fetch` calls are rewritten to go through this proxy, which
avoids CORS problems on the target site.

## Settings

The **Settings** tab controls how the proxy makes requests:

- `fetchMode` - `PROXY` (default) routes through the server, `NODE_FETCH` uses
  Node's built-in `fetch`, and `CURL` shells out to `curl`. `CURL` is the most
  compatible with sites that need specific TLS or HTTP/2 behaviour.
- `useUserAgent` - send a browser user agent instead of a plain one.

Settings persist between restarts in `.cache/server-settings.json`. Delete that
file to go back to the defaults.

## Features Overview

The testing website provides five main sections to test different plugin functions:

- **Headers** - Configure custom HTTP headers
- **Popular Novels** - Test `popularNovels()` with pagination and filters
- **Search Novels** - Test `searchNovels()` with search queries
- **Parse Novel** - Test `parseNovel()` with a novel path
- **Parse Chapter** - Test `parseChapter()` with a chapter path

## Pre-Submission Testing

Before submitting your plugin, verify that all five sections work without errors, multiple pages load, search returns accurate results, novel parsing extracts all metadata, chapter content is clean, filters work (if implemented), no console errors appear, paths are properly formatted, and images load correctly.

## Need Help?

- **Plugin Development:** See [docs.md](./docs.md) for API reference
- **Quick Start:** See [quickstart.md](./quickstart.md) for plugin creation
- **Issues:** Create a [GitHub issue](https://github.com/LNReader/lnreader-plugins/issues/new)
- **Community:** Join us on [Discord](https://discord.gg/QdcWN4MD63)
