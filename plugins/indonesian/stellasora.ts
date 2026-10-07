import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { storage } from '@libs/storage';
import { NovelStatus } from '@libs/novelStatus';
import { defaultCover } from '@libs/defaultCover';

// allow: SIZE_OK — scripts/generate-plugin-index.js imports exactly one default
// export per plugin file, so the wiki parser, renderer and translator must all
// live in this single module (same architecture as wtrlab.ts).

type StageRef = {
  depth: number;
  label: string;
  target: string | null;
  name: string;
  tagline: string | null;
};

type TextPayload = {
  raw: string;
  prepared: string;
  translated: string;
  final: string;
};

type Branch = { group: string; option: string };

type RawElement =
  | { kind: 'bg'; name: string }
  | { kind: 'element'; name: string }
  | { kind: 'bgm'; name: string }
  | { kind: 'bgmstop' };

type MessengerBlock =
  | { type: 'info'; text: TextPayload; branch: Branch | null }
  | {
      type: 'message';
      name: string | null;
      image: string | null;
      text: TextPayload;
      branch: Branch | null;
    }
  | {
      type: 'reply';
      image: string | null;
      text: TextPayload;
      branch: Branch | null;
    }
  | { type: 'options'; group: string; options: TextPayload[] }
  | { type: 'raw'; elements: RawElement[] };

type PlotChunk =
  | { kind: 'para'; text: TextPayload }
  | { kind: 'list'; items: TextPayload[] };

type StageContent = {
  ref: StageRef;
  tagline: TextPayload | null;
  cover: string | null;
  date: TextPayload | null;
  plot: PlotChunk[];
  choiceIntro: TextPayload[];
  choiceBullets: { label: string; value: string }[];
  blocks: MessengerBlock[];
};

type Build = {
  payloads: TextPayload[];
  imageNames: string[];
  baseNames: string[];
  nameList: string[];
  nameIndex: Map<string, number>;
  slots: { name: string; url: string | null }[];
  resolver: Map<string, string>;
};

type RenderState = {
  branchState: Map<string, string>;
  optionsByGroup: Map<string, string[]>;
};

type ParseResponse = {
  parse?: { wikitext?: string };
  error?: { code?: string; info?: string };
};

type ImageQueryResponse = {
  query?: {
    pages?: {
      title?: string;
      missing?: boolean;
      imageinfo?: { url?: string }[];
    }[];
  };
};

class StellaSoraPlugin implements Plugin.PluginBase {
  id = 'STELLASORA';
  name = 'Stella Sora';
  site = 'https://stellasora.miraheze.org/';
  version = '1.0.0';
  icon = 'src/id/stellasora/icon.png';
  sourceLang = 'en';
  webStorageUtilized = true;
  imageRequestInit: Plugin.ImageRequestInit = {
    headers: { Referer: this.site },
  };

  filters = {
    search: {
      value: '',
      label: 'Search',
      type: FilterTypes.TextInput,
    },
  } satisfies Filters;

  private readonly NOVEL_NAME = 'Stella Sora - Main Story';
  private readonly NOVEL_PATH = 'Main_Story';
  private readonly API = this.site + 'w/api.php';

  private readonly G_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
  private readonly G_URL =
    'https://translate-pa.googleapis.com/v1/translateHtml';

  // Storage keys (per-plugin namespace)
  private readonly K_NOVEL = 'stellasora:novel';
  private readonly K_READER = 'stellasora:reader';
  private readonly K_TR = 'stellasora:tr';
  private readonly K_COVER = 'stellasora:cover';
  private readonly K_WIKI = 'stellasora:wiki';

  // TTLs in milliseconds (absolute epoch passed to storage.set)
  private readonly NOVEL_TTL = 60 * 60 * 1000;
  private readonly WIKI_TTL = 60 * 60 * 1000;
  private readonly COVER_TTL = 60 * 60 * 1000;
  private readonly READER_TTL = 30 * 24 * 60 * 60 * 1000;
  private readonly TR_TTL = 365 * 24 * 60 * 60 * 1000;
  private readonly MEM_TTL = 10 * 60 * 1000;

  private readonly TOKEN_BR = '__SSBR__';

  private memCache: Map<string, { value: unknown; expires: number }> =
    new Map();

  // ---------------------------------------------------------------------------
  // HTTP helpers
  // ---------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** JSON GET with retry/backoff on 429/5xx and network errors. */
  private async apiJson<T>(url: string): Promise<T> {
    let lastError: Error = new Error('Wiki request failed');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await this.delay(800 * Math.pow(2, attempt - 1));
      let retryable = true;
      try {
        const res = await fetchApi(url, {
          headers: { accept: 'application/json' },
        });
        if (res.ok) return (await res.json()) as T;
        lastError = new Error('Wiki request failed: HTTP ' + res.status);
        retryable = res.status === 429 || res.status >= 500;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        retryable = true;
      }
      if (!retryable) break;
    }
    throw lastError;
  }

  /** Fetch page wikitext via action=parse (memory + storage cached, 1h). */
  private async fetchWikitext(title: string): Promise<string> {
    const key = this.K_WIKI + ':' + title;
    const mem = this.memCache.get(key);
    if (mem !== undefined && mem.expires > Date.now()) {
      return mem.value as string;
    }
    const persisted = storage.get<string>(key);
    if (persisted !== undefined && persisted !== '') return persisted;

    const url =
      this.API +
      '?action=parse&prop=wikitext&page=' +
      encodeURIComponent(title) +
      '&format=json&formatversion=2';
    const data = await this.apiJson<ParseResponse>(url);
    const wikitext = data.parse?.wikitext;
    if (typeof wikitext !== 'string' || wikitext === '') {
      throw new Error('stellasora: missing wikitext for ' + title);
    }
    this.memCache.set(key, {
      value: wikitext,
      expires: Date.now() + this.MEM_TTL,
    });
    storage.set(key, wikitext, Date.now() + this.WIKI_TTL);
    await this.delay(200);
    return wikitext;
  }

  // ---------------------------------------------------------------------------
  // Text helpers
  // ---------------------------------------------------------------------------

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private attr(s: string): string {
    return s.replace(/"/g, '&quot;');
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Extract a {{Name ...}} template body (nesting aware), or null. */
  private extractTemplate(wiki: string, name: string): string | null {
    const re = new RegExp('\\{\\{\\s*' + name + '(?=[\\s|}])', 'i');
    const m = re.exec(wiki);
    if (!m) return null;
    let depth = 0;
    for (let i = m.index; i < wiki.length - 1; i++) {
      const two = wiki.slice(i, i + 2);
      if (two === '{{') {
        depth++;
        i++;
        continue;
      }
      if (two === '}}') {
        depth--;
        if (depth === 0) return wiki.slice(m.index + m[0].length, i);
        i++;
      }
    }
    return null;
  }

  /** Split on top-level pipes, ignoring pipes nested in {{ }} or [[ ]]. */
  private splitTopLevel(body: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (let i = 0; i < body.length; i++) {
      const two = body.slice(i, i + 2);
      if (two === '{{' || two === '[[') {
        depth++;
        cur += two;
        i++;
        continue;
      }
      if (two === '}}' || two === ']]') {
        if (depth > 0) depth--;
        cur += two;
        i++;
        continue;
      }
      if (body[i] === '|' && depth === 0) {
        parts.push(cur);
        cur = '';
        continue;
      }
      cur += body[i];
    }
    parts.push(cur);
    return parts;
  }

  /** Split wiki text into == Heading == sections (lead before first is dropped). */
  private splitSections(wiki: string): { title: string; content: string }[] {
    const out: { title: string; content: string }[] = [];
    const re = /^==+\s*([^=\n]+?)\s*==+\s*$/gm;
    let m: RegExpExecArray | null;
    let title: string | null = null;
    let start = 0;
    while ((m = re.exec(wiki)) !== null) {
      if (title !== null)
        out.push({ title, content: wiki.slice(start, m.index) });
      title = m[1];
      start = m.index + m[0].length;
    }
    if (title !== null) out.push({ title, content: wiki.slice(start) });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Translation payload pipeline
  // ---------------------------------------------------------------------------

  private newBuild(): Build {
    return {
      payloads: [],
      imageNames: [],
      baseNames: [],
      nameList: [],
      nameIndex: new Map<string, number>(),
      slots: [],
      resolver: new Map<string, string>(),
    };
  }

  private newPayload(raw: string, build: Build): TextPayload {
    const p: TextPayload = { raw, prepared: '', translated: '', final: '' };
    build.payloads.push(p);
    return p;
  }

  /**
   * Normalize raw wikitext into plain escaped text safe to send to Google:
   * <br> → token, <username> → Tyrant, bold/italic stripped, HTML escaped,
   * non-Ruby templates expanded, wikilinks flattened (File links → slots).
   * Ruby templates are intentionally left intact (verified to survive the
   * translator with their parameters translated in place).
   */
  private prepareText(
    raw: string,
    build: Build,
  ): { text: string; labels: string[] } {
    let s = raw
      .replace(/<br\s*\/?>/gi, this.TOKEN_BR)
      .replace(/<username>/gi, 'Tyrant');
    s = s.replace(/'''/g, '').replace(/''/g, '');
    s = this.esc(s);
    s = this.expandTemplates(s);
    const labels: string[] = [];
    s = this.expandLinks(s, labels, build);
    return { text: s, labels };
  }

  /** Innermost-first expansion of {{...}} templates (bounded iterations). */
  private expandTemplates(text: string): string {
    let out = text;
    for (let i = 0; i < 16; i++) {
      const next = out.replace(
        /\{\{\s*([^{}]+?)\s*\}\}/g,
        (match: string, body: string) => this.expandOneTemplate(match, body),
      );
      if (next === out) break;
      out = next;
    }
    return out;
  }

  private expandOneTemplate(match: string, body: string): string {
    const parts = this.splitTopLevel(body);
    const name = (parts[0] ?? '').trim().toLowerCase();
    const args = parts.slice(1);
    if (name === '=') return '=';
    if (name === 'gendercontent') {
      for (const a of args) {
        const kv = a.match(/^1=([\s\S]*)$/);
        if (kv) return kv[1].trim();
      }
      return args.length > 0 ? args[0].trim() : '';
    }
    if (name === 'lang') {
      return args.length > 1 ? args.slice(1).join('|') : args[0] ?? '';
    }
    if (name === 'ruby' || name === 'rb') return match;
    if (name.indexOf('story/') === 0 || name.indexOf('audio/') === 0) return '';
    if (
      name === 'storynav' ||
      name === 'gendertoggle' ||
      name === 'spoilerwarning' ||
      name === 'messenger'
    ) {
      return '';
    }
    return match;
  }

  /**
   * Flatten [[links]]; File links become image slots (tokenized), other links
   * become their display text (collected for name protection).
   */
  private expandLinks(text: string, labels: string[], build: Build): string {
    return text.replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match: string, target: string, label?: string) => {
        const t = target.trim();
        if (/^File:/i.test(t)) {
          const idx = build.slots.length;
          build.slots.push({
            name: t.replace(/^File:/i, '').trim(),
            url: null,
          });
          return '__SSIMG' + idx + '__';
        }
        const display = (label ?? target).trim();
        labels.push(display);
        return display;
      },
    );
  }

  /** Register a protected name (esc'd display) and return its token index. */
  private registerName(name: string, build: Build): number {
    const key = name.toLowerCase();
    const existing = build.nameIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = build.nameList.length;
    build.nameList.push(this.esc(name));
    build.nameIndex.set(key, idx);
    return idx;
  }

  /**
   * Single-pass placeholder protection: every name (case-insensitive, word
   * boundary aware) becomes __SSNAME{n}__ before the text reaches Google.
   */
  private protectAll(text: string, extra: string[], build: Build): string {
    const seen = new Map<string, boolean>();
    const patternToIdx = new Map<string, number>();
    const patterns: string[] = [];
    const names = build.baseNames.concat(extra);
    for (const name of names) {
      const trimmed = name.trim();
      if (trimmed === '') continue;
      const lower = trimmed.toLowerCase();
      if (seen.has(lower)) continue;
      seen.set(lower, true);
      const idx = this.registerName(trimmed, build);
      const escd = this.esc(trimmed);
      patternToIdx.set(escd.toLowerCase(), idx);
      patterns.push(escd);
    }
    if (patterns.length === 0) return text;
    patterns.sort((a, b) => b.length - a.length);
    const alternation = patterns.map(p => this.escapeRegex(p)).join('|');
    const re = new RegExp(
      '(^|[^A-Za-z0-9])(?:' + alternation + ')(?![A-Za-z0-9])',
      'gi',
    );
    return text.replace(re, (match: string, prefix: string) => {
      const inner = match.slice(prefix.length);
      const idx = patternToIdx.get(inner.toLowerCase());
      if (idx === undefined) return match;
      return prefix + '__SSNAME' + idx + '__';
    });
  }

  /** Prepare + protect every payload, then translate the whole batch once. */
  private async prepareAndTranslate(build: Build): Promise<boolean> {
    for (const p of build.payloads) {
      if (p.raw === '') continue;
      const pre = this.prepareText(p.raw, build);
      p.prepared = this.protectAll(pre.text, pre.labels, build);
    }
    const pending = build.payloads.filter(p => p.prepared !== '');
    if (pending.length === 0) return true;
    const inputs = pending.map(p => p.prepared);
    let outputs = inputs;
    let ok = true;
    try {
      const out = await this.translate(inputs);
      outputs = inputs.map((t, i) => {
        const v = out[i];
        return typeof v === 'string' && v !== '' ? v : t;
      });
    } catch (e) {
      console.error('stellasora: translate failed', e);
      ok = false;
    }
    pending.forEach((p, i) => {
      p.translated = outputs[i];
    });
    return ok;
  }

  /** Restore tokens and expand Ruby into final HTML-safe chapter text. */
  private finalizePayload(text: string, build: Build): string {
    let out = text;
    out = out.replace(
      /__SSNAME\s*(\d+)\s*__/gi,
      (match: string, idx: string) => {
        const v = build.nameList[parseInt(idx, 10)];
        return v !== undefined ? v : match;
      },
    );
    out = out.replace(
      /__SSIMG\s*(\d+)\s*__/gi,
      (_match: string, idx: string) => {
        const slot = build.slots[parseInt(idx, 10)];
        if (!slot || !slot.url) return '';
        return (
          '<img src="' + this.attr(slot.url) + '" loading="lazy" alt="" />'
        );
      },
    );
    out = out.replace(
      /\{\{\s*[Rr]uby\s*\|\s*([^|{}]+?)\s*\|\s*([^|{}]+?)\s*\}\}/g,
      (_m: string, base: string, reading: string) =>
        '<ruby>' + base.trim() + '<rt>' + reading.trim() + '</rt></ruby>',
    );
    out = out.replace(/__\s*SSBR\s*__/gi, '<br />');
    return out;
  }

  private finalizeAll(build: Build): void {
    build.payloads.forEach(p => {
      p.final =
        p.prepared === ''
          ? ''
          : this.finalizePayload(p.translated || p.prepared, build);
    });
  }

  /** Hash helper used to cache translated batches (avoid Google spam detection). */
  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash << 5) - hash + input.charCodeAt(i);
      hash |= 0;
    }
    return (hash >>> 0).toString(36);
  }

  async translate(data: string[]): Promise<string[]> {
    if (data.length === 0) return [];
    const fullKey = `${this.K_TR}:${this.simpleHash(data.join('\u0001'))}`;
    const fullCached = storage.get<string[]>(fullKey);
    if (fullCached !== undefined && fullCached.length === data.length) {
      return fullCached;
    }

    // Google rejects oversized single requests (HTML error page), so translate
    // in small chunks: <=40 strings and <=~8KB of payload text per call.
    const out: string[] = [];
    let idx = 0;
    while (idx < data.length) {
      const chunk: string[] = [];
      let bytes = 0;
      while (idx < data.length && chunk.length < 40) {
        const next = data[idx];
        const nextBytes = next.length + 8;
        if (chunk.length > 0 && bytes + nextBytes > 8000) break;
        chunk.push(next);
        bytes += nextBytes;
        idx++;
      }
      const chunkKey = fullKey + ':' + this.simpleHash(chunk.join('\u0001'));
      const cachedChunk = storage.get<string[]>(chunkKey);
      if (cachedChunk !== undefined && cachedChunk.length === chunk.length) {
        chunk.forEach((_c, i) => out.push(cachedChunk[i] ?? ''));
        continue;
      }
      const res = await this.translateChunk(chunk);
      storage.set(chunkKey, res, Date.now() + this.TR_TTL);
      res.forEach(v => out.push(v));
      if (idx < data.length) await this.delay(300);
    }
    storage.set(fullKey, out, Date.now() + this.TR_TTL);
    return out;
  }

  /** One translateHtml POST with validation + backoff (mirrors apiJson). */
  private async translateChunk(data: string[]): Promise<string[]> {
    let lastError: Error = new Error('translate failed');
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await this.delay(800 * Math.pow(2, attempt - 1));
      try {
        const response = await fetchApi(this.G_URL, {
          'credentials': 'omit',
          'headers': {
            'content-type': 'application/json+protobuf',
            'X-Goog-API-Key': this.G_KEY,
          },
          'referrer': this.site,
          'body': `[[${JSON.stringify(data)},"auto","id"],"te_lib"]`,
          'method': 'POST',
        });
        if (!response.ok) {
          lastError = new Error('translate HTTP ' + response.status);
          if (response.status === 429 || response.status >= 500) continue;
          break;
        }
        const text = await response.text();
        if (text.charCodeAt(0) !== 91 /* '[' */) {
          // HTML/other error page instead of the JSON array — retryable.
          lastError = new Error('translate non-JSON response');
          continue;
        }
        const translated = JSON.parse(text) as unknown;
        if (Array.isArray(translated) && Array.isArray(translated[0])) {
          return translated[0] as string[];
        }
        lastError = new Error('translate unexpected payload shape');
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError;
  }

  // ---------------------------------------------------------------------------
  // Wiki parsers
  // ---------------------------------------------------------------------------

  private parseChapterData(wiki: string): {
    name: string | null;
    image: string | null;
  } {
    const out: { name: string | null; image: string | null } = {
      name: null,
      image: null,
    };
    const body = this.extractTemplate(wiki, 'ChapterData');
    if (body === null) return out;
    this.splitTopLevel(body).forEach(part => {
      const m = part.match(/^\s*([\w-]+)\s*=\s*([\s\S]*?)\s*$/);
      if (!m) return;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if (key === 'name') out.name = value !== '' ? value : null;
      else if (key === 'image') out.image = value !== '' ? value : null;
    });
    return out;
  }

  /** Parse the == Stages == list of a chapter page into stage references. */
  private parseStageRefs(wiki: string): StageRef[] {
    const sections = this.splitSections(wiki);
    const sec = sections.filter(s => s.title.toLowerCase() === 'stages')[0];
    if (!sec) return [];
    const refs: StageRef[] = [];
    sec.content.split('\n').forEach(line => {
      const star = line.match(/^(\*+)\s*(.*)$/);
      if (!star) return;
      let body = star[2].replace(/'''/g, '').replace(/''/g, '').trim();
      let tagline: string | null = null;
      const br = body.match(/^(.*?)<br\s*\/?>([\s\S]*)$/i);
      if (br) {
        body = br[1].trim();
        const t = br[2].trim();
        tagline = t !== '' ? t : null;
      }
      const link = body.match(/^(.+?):\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s*$/);
      if (link) {
        const target = link[2].trim();
        const display = link[3]
          ? link[3].trim()
          : target.split('/').pop() || target;
        refs.push({
          depth: star[1].length,
          label: link[1].trim(),
          target,
          name: display,
          tagline,
        });
        return;
      }
      const plain = body.match(/^(.+?):\s*(.+)$/);
      if (plain) {
        refs.push({
          depth: star[1].length,
          label: plain[1].trim(),
          target: null,
          name: plain[2].trim(),
          tagline,
        });
        return;
      }
      refs.push({
        depth: star[1].length,
        label: body,
        target: null,
        name: body,
        tagline,
      });
    });
    return refs;
  }

  private parsePlotChunks(content: string, build: Build): PlotChunk[] {
    const chunks: PlotChunk[] = [];
    content.split(/\n[ \t]*\n+/).forEach(block => {
      const trimmed = block.trim();
      if (trimmed === '') return;
      const lines = trimmed
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '');
      const allBullets =
        lines.filter(l => l.indexOf('*') === 0).length === lines.length;
      if (allBullets) {
        const items = lines.map(l =>
          this.newPayload(l.replace(/^\*+\s*/, ''), build),
        );
        chunks.push({ kind: 'list', items });
      } else {
        chunks.push({
          kind: 'para',
          text: this.newPayload(lines.join(' '), build),
        });
      }
    });
    return chunks;
  }

  private parseChoice(
    content: string,
    stage: StageContent,
    build: Build,
  ): void {
    content.split(/\n[ \t]*\n+/).forEach(block => {
      const trimmed = block.trim();
      if (trimmed === '') return;
      const lines = trimmed
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '');
      const allBullets =
        lines.filter(l => l.indexOf('*') === 0).length === lines.length;
      if (!allBullets) {
        stage.choiceIntro.push(this.newPayload(lines.join(' '), build));
        return;
      }
      lines.forEach(l => {
        const bare = l.replace(/^\*+\s*/, '');
        const m = bare.match(/^'''(.+?)''':\s*([\s\S]*)$/);
        if (m) {
          stage.choiceBullets.push({ label: m[1].trim(), value: m[2].trim() });
        } else {
          stage.choiceIntro.push(this.newPayload(bare, build));
        }
      });
    });
  }

  private parseRawElements(content: string): RawElement[] {
    const out: RawElement[] = [];
    const re =
      /\{\{\s*Story\/background\s*\|\s*([^}|]+?)\s*\}\}|\{\{\s*Story\/bgm\s*\|\s*([^}|]+?)\s*\}\}|\{\{\s*Story\/bgm\s+stop\s*\}\}|\{\{\s*Audio\/se\b[^}]*\}\}|\[\[\s*File:\s*([^\]|]+?)(?:\|[^\]]*)?\]\]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m[1] !== undefined) {
        out.push({ kind: 'bg', name: m[1].trim() });
      } else if (m[2] !== undefined) {
        out.push({ kind: 'bgm', name: m[2].trim() });
      } else if (m[3] !== undefined) {
        out.push({ kind: 'element', name: m[3].trim() });
      } else if (/bgm\s+stop/i.test(m[0])) {
        out.push({ kind: 'bgmstop' });
      }
    }
    return out;
  }

  private branchOf(fields: Map<string, string>): Branch | null {
    const group = (fields.get('group') ?? '').trim();
    const option = (fields.get('option') ?? '').trim();
    if (group === '' && option === '') return null;
    return { group, option };
  }

  /** Parse the {{Messenger ...}} body into structured blocks. */
  private parseMessengerBlocks(body: string, build: Build): MessengerBlock[] {
    const blocks: MessengerBlock[] = [];
    body.split(/\n[ \t]*\n/).forEach(seg => {
      const lines = seg
        .split('\n')
        .map(l => l.trim())
        .filter(l => l !== '');
      if (lines.length === 0) return;
      const typeMatch = lines[0].match(/^\|\s*([A-Za-z]+)\s*$/);
      if (!typeMatch) return;
      const type = typeMatch[1].toLowerCase();
      const fields = new Map<string, string>();
      let lastKey = '';
      for (let i = 1; i < lines.length; i++) {
        const fm = lines[i].match(/^\|\s*([A-Za-z0-9_-]+)\s*(?:::|=)\s?(.*)$/);
        if (fm) {
          lastKey = fm[1].toLowerCase();
          fields.set(lastKey, fm[2]);
        } else if (lastKey !== '') {
          const cont = lines[i].replace(/^\|\s?/, '');
          fields.set(lastKey, (fields.get(lastKey) ?? '') + '\n' + cont);
        }
      }
      const branch = this.branchOf(fields);
      switch (type) {
        case 'info':
          blocks.push({
            type: 'info',
            text: this.newPayload(fields.get('text') ?? '', build),
            branch,
          });
          break;
        case 'message': {
          const name = (fields.get('name') ?? '').trim();
          const image = (fields.get('image') ?? '').trim();
          blocks.push({
            type: 'message',
            name: name === '' ? null : name,
            image: image === '' ? null : image,
            text: this.newPayload(fields.get('text') ?? '', build),
            branch,
          });
          break;
        }
        case 'reply':
          blocks.push({
            type: 'reply',
            image: (fields.get('image') ?? '').trim() || null,
            text: this.newPayload(fields.get('text') ?? '', build),
            branch,
          });
          break;
        case 'options': {
          const group = (fields.get('group') ?? '').trim();
          const optKeys: string[] = [];
          fields.forEach((_v, k) => {
            if (/^option\d+$/.test(k)) optKeys.push(k);
          });
          optKeys.sort(
            (a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10),
          );
          const options = optKeys.map(k =>
            this.newPayload(fields.get(k) ?? '', build),
          );
          blocks.push({ type: 'options', group, options });
          break;
        }
        case 'raw':
          blocks.push({
            type: 'raw',
            elements: this.parseRawElements(fields.get('content') ?? ''),
          });
          break;
        default:
          break;
      }
    });
    return blocks;
  }

  /** Parse one stage wiki page (cover, Date/Plot/Choice/Transcript). */
  private parseStagePage(
    wiki: string,
    ref: StageRef,
    tagline: TextPayload | null,
    build: Build,
  ): StageContent {
    const stage: StageContent = {
      ref,
      tagline,
      cover: null,
      date: null,
      plot: [],
      choiceIntro: [],
      choiceBullets: [],
      blocks: [],
    };
    const firstHeading = wiki.search(/^==/m);
    const lead = firstHeading >= 0 ? wiki.slice(0, firstHeading) : wiki;
    const coverMatch = lead.match(
      /\[\[\s*File:\s*([^\]|]+?)(?:\|[^\]]*)?\]\]/i,
    );
    if (coverMatch) {
      stage.cover = coverMatch[1].trim();
      build.imageNames.push(stage.cover);
    }
    this.splitSections(wiki).forEach(sec => {
      const title = sec.title.toLowerCase();
      if (title === 'date') {
        const text = sec.content.replace(/\s+/g, ' ').trim();
        if (text !== '') stage.date = this.newPayload(text, build);
      } else if (title === 'plot') {
        stage.plot = this.parsePlotChunks(sec.content, build);
      } else if (title === 'choice') {
        this.parseChoice(sec.content, stage, build);
      } else if (title === 'transcript') {
        const body = this.extractTemplate(sec.content, 'Messenger');
        if (body !== null) {
          stage.blocks = this.parseMessengerBlocks(body, build);
        }
      }
    });
    return stage;
  }

  private emptyStage(ref: StageRef, tagline: TextPayload | null): StageContent {
    return {
      ref,
      tagline,
      cover: null,
      date: null,
      plot: [],
      choiceIntro: [],
      choiceBullets: [],
      blocks: [],
    };
  }

  private collectNames(
    stages: StageContent[],
    chapterName: string,
    build: Build,
  ): void {
    build.baseNames.push('Tyrant', 'Main Story', 'Stella Sora');
    if (chapterName !== '') build.baseNames.push(chapterName);
    stages.forEach(stage => {
      build.baseNames.push(stage.ref.name);
      stage.blocks.forEach(block => {
        if (block.type === 'message' && block.name !== null) {
          build.baseNames.push(block.name);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Image resolution
  // ---------------------------------------------------------------------------

  private normalizeImageName(name: string): string {
    const n = name.replace(/_/g, ' ').trim();
    if (n === '') return '';
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  private imageCandidates(name: string): string[] {
    if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return [name];
    return [
      name,
      name + '.png',
      name + '.jpg',
      name + '.jpeg',
      name + '.webp',
      name + '.gif',
    ];
  }

  /** Batch-resolve File titles to direct URLs (≤40 titles per API call). */
  private async resolveImages(names: string[], build: Build): Promise<void> {
    const candidatesByKey = new Map<string, string[]>();
    names.forEach(name => {
      const norm = this.normalizeImageName(name);
      if (norm === '') return;
      const key = norm.toLowerCase();
      if (candidatesByKey.has(key)) return;
      candidatesByKey.set(key, this.imageCandidates(norm));
    });

    const titleToUrl = new Map<string, string>();
    const titles: string[] = [];
    const seen = new Map<string, boolean>();
    candidatesByKey.forEach(cands => {
      cands.forEach(c => {
        const full = 'File:' + c;
        const key = full.toLowerCase();
        if (seen.has(key)) return;
        seen.set(key, true);
        titles.push(full);
      });
    });

    for (let i = 0; i < titles.length; i += 40) {
      const chunk = titles.slice(i, i + 40);
      try {
        const url =
          this.API +
          '?action=query&titles=' +
          encodeURIComponent(chunk.join('|')) +
          '&prop=imageinfo&iiprop=url&format=json&formatversion=2';
        const data = await this.apiJson<ImageQueryResponse>(url);
        const pages = data.query?.pages ?? [];
        pages.forEach(page => {
          if (page.missing || !page.title) return;
          const info = page.imageinfo?.[0];
          if (info?.url) titleToUrl.set(page.title.toLowerCase(), info.url);
        });
      } catch (e) {
        console.error('stellasora: imageinfo query failed', e);
      }
      await this.delay(200);
    }

    candidatesByKey.forEach((cands, key) => {
      for (const c of cands) {
        const url = titleToUrl.get(('File:' + c).toLowerCase());
        if (url !== undefined) {
          build.resolver.set(key, url);
          return;
        }
      }
    });
  }

  private imageUrl(name: string, build: Build): string | null {
    return (
      build.resolver.get(this.normalizeImageName(name).toLowerCase()) ?? null
    );
  }

  /** Novel cover: Chapter stage 01 art, falling back to ss-ms-cover. */
  private async resolveCover(): Promise<string> {
    const cached = storage.get<string>(this.K_COVER);
    if (cached !== undefined && cached !== '') return cached;
    const build = this.newBuild();
    await this.resolveImages(
      ['Chapter stage 01.png', 'Ss-ms-cover.png'],
      build,
    );
    const url =
      build.resolver.get(
        this.normalizeImageName('Chapter stage 01.png').toLowerCase(),
      ) ??
      build.resolver.get(
        this.normalizeImageName('Ss-ms-cover.png').toLowerCase(),
      ) ??
      '';
    if (url !== '') storage.set(this.K_COVER, url, Date.now() + this.COVER_TTL);
    return url;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  private branchMarker(
    block: { branch: Branch | null },
    state: RenderState,
  ): string {
    const branch = block.branch;
    if (branch === null || branch.group === '' || branch.option === '') {
      return '';
    }
    const prev = state.branchState.get(branch.group);
    let marker = '';
    if (prev !== undefined && prev !== branch.option) {
      const options = state.optionsByGroup.get(branch.group);
      let label = branch.option;
      if (options !== undefined) {
        const idx = parseInt(branch.option, 10) - 1;
        if (idx >= 0 && idx < options.length) label = options[idx];
      }
      marker = '<p class="branch">→ ' + label + '</p>';
    }
    state.branchState.set(branch.group, branch.option);
    return marker;
  }

  private renderBlock(
    block: MessengerBlock,
    state: RenderState,
    build: Build,
  ): string {
    if (block.type === 'options') {
      const items = block.options
        .map(
          o => '<li>' + (o.final !== '' ? o.final : this.esc(o.raw)) + '</li>',
        )
        .join('');
      if (block.group !== '') {
        state.optionsByGroup.set(
          block.group,
          block.options.map(o => o.final),
        );
      }
      return '<ol class="choices">' + items + '</ol>';
    }
    if (block.type === 'raw') {
      const parts: string[] = [];
      block.elements.forEach(el => {
        if (el.kind === 'bgm') {
          parts.push(
            '<p class="cue">♪ BGM: ' +
              this.esc(el.name.replace(/\.[A-Za-z0-9]+$/, '')) +
              '</p>',
          );
        } else if (el.kind === 'bgmstop') {
          parts.push('<p class="cue">♪ BGM: stop</p>');
        } else if (el.kind === 'bg') {
          const url = this.imageUrl(el.name, build);
          if (url !== null) {
            parts.push(
              '<figure class="bg"><img src="' +
                this.attr(url) +
                '" loading="lazy" alt="" /></figure>',
            );
          }
        } else {
          const url = this.imageUrl(el.name, build);
          if (url !== null) {
            parts.push(
              '<p class="element"><img src="' +
                this.attr(url) +
                '" loading="lazy" alt="" /></p>',
            );
          }
        }
      });
      return parts.join('\n');
    }

    const marker = this.branchMarker(block, state);
    const wrap = (element: string) =>
      marker === '' ? element : marker + '\n' + element;

    if (block.type === 'info') {
      return wrap('<p class="info">' + block.text.final + '</p>');
    }
    if (block.type === 'reply') {
      const portrait =
        block.image !== null ? this.imageUrl(block.image, build) : null;
      const img =
        portrait !== null
          ? '<img class="portrait" src="' +
            this.attr(portrait) +
            '" loading="lazy" alt="" />'
          : '';
      return wrap(
        '<p class="line">' +
          img +
          '<span class="speaker">Tyrant:</span> ' +
          block.text.final +
          '</p>',
      );
    }
    if (block.name === null) {
      return wrap('<p class="narration">' + block.text.final + '</p>');
    }
    const pUrl =
      block.image !== null ? this.imageUrl(block.image, build) : null;
    const pImg =
      pUrl !== null
        ? '<img class="portrait" src="' +
          this.attr(pUrl) +
          '" loading="lazy" alt="" />'
        : '';
    return wrap(
      '<p class="line">' +
        pImg +
        '<span class="speaker">' +
        this.esc(block.name) +
        ':</span> ' +
        block.text.final +
        '</p>',
    );
  }

  private renderStage(stage: StageContent, build: Build): string {
    const state: RenderState = {
      branchState: new Map<string, string>(),
      optionsByGroup: new Map<string, string[]>(),
    };
    const out: string[] = [];
    const heading =
      this.esc(stage.ref.label) + ' - ' + this.esc(stage.ref.name);
    out.push(
      stage.ref.depth > 1
        ? '<h3>' + heading + '</h3>'
        : '<h2>' + heading + '</h2>',
    );
    if (stage.tagline !== null && stage.tagline.final !== '') {
      out.push('<p class="tagline">' + stage.tagline.final + '</p>');
    }
    if (stage.cover !== null) {
      const url = this.imageUrl(stage.cover, build);
      if (url !== null) {
        out.push(
          '<figure class="cover"><img src="' +
            this.attr(url) +
            '" loading="lazy" alt="' +
            this.esc(stage.ref.name) +
            '" /></figure>',
        );
      }
    }
    if (stage.date !== null && stage.date.final !== '') {
      out.push('<h3>Date</h3>');
      out.push('<p class="date">' + stage.date.final + '</p>');
    }
    if (stage.plot.length > 0) {
      out.push('<h3>Plot</h3>');
      stage.plot.forEach(chunk => {
        if (chunk.kind === 'para') {
          out.push('<p>' + chunk.text.final + '</p>');
        } else {
          const items = chunk.items
            .map(it => '<li>' + it.final + '</li>')
            .join('');
          out.push('<ul class="plot-list">' + items + '</ul>');
        }
      });
    }
    if (stage.choiceIntro.length > 0 || stage.choiceBullets.length > 0) {
      out.push('<h3>Choice</h3>');
      stage.choiceIntro.forEach(p => out.push('<p>' + p.final + '</p>'));
      if (stage.choiceBullets.length > 0) {
        const items = stage.choiceBullets
          .map(
            b =>
              '<li><strong>' +
              this.esc(b.label) +
              '</strong>: ' +
              this.esc(b.value) +
              '</li>',
          )
          .join('');
        out.push('<ul class="choices">' + items + '</ul>');
      }
    }
    if (stage.blocks.length > 0) {
      out.push('<h3>Transcript</h3>');
      stage.blocks.forEach(block =>
        out.push(this.renderBlock(block, state, build)),
      );
    }
    return out.join('\n');
  }

  private renderChapter(stages: StageContent[], build: Build): string {
    const parts: string[] = [];
    stages.forEach((stage, i) => {
      parts.push(this.renderStage(stage, build));
      if (i < stages.length - 1) parts.push('<hr />');
    });
    return parts.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Plugin API
  // ---------------------------------------------------------------------------

  private matchesSearch(term: string): boolean {
    const n = term.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (n === '') return true;
    const targets = ['stellasora', 'mainstory'];
    for (const t of targets) {
      if (t.indexOf(n) >= 0 || n.indexOf(t) >= 0) return true;
    }
    return false;
  }

  private chapterTitle(path: string): string {
    const token = path.replace(/^\/+|\/+$/g, '');
    if (token === 'chapter/sp') return 'Main Story/Special Chapter';
    const m = token.match(/^chapter\/(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 9) return 'Main Story/Chapter ' + n;
    }
    throw new Error('stellasora: unknown chapter path ' + path);
  }

  async popularNovels(
    pageNo: number,
    { filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1 || !this.matchesSearch(filters.search.value)) return [];
    const cover = await this.resolveCover();
    return [
      {
        name: this.NOVEL_NAME,
        path: this.NOVEL_PATH,
        cover: cover !== '' ? cover : defaultCover,
      },
    ];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const cached = storage.get<Plugin.SourceNovel>(this.K_NOVEL);
    if (cached !== undefined) return cached;

    const mainWiki = await this.fetchWikitext('Main Story');
    const leadEnd = mainWiki.search(/^==/m);
    const rawLead = leadEnd >= 0 ? mainWiki.slice(0, leadEnd) : mainWiki;
    const lead = rawLead
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '' && l.indexOf('[[File:') !== 0)
      .join(' ');

    const chapters: Plugin.ChapterItem[] = [];
    for (let n = 1; n <= 9; n++) {
      const wiki = await this.fetchWikitext('Main Story/Chapter ' + n);
      const cd = this.parseChapterData(wiki);
      chapters.push({
        name: cd.name ? 'Chapter ' + n + ' - ' + cd.name : 'Chapter ' + n,
        path: 'chapter/' + n,
        chapterNumber: n,
        releaseTime: null,
      });
    }
    const spWiki = await this.fetchWikitext('Main Story/Special Chapter');
    const spCd = this.parseChapterData(spWiki);
    chapters.push({
      name: spCd.name ? 'Special - ' + spCd.name : 'Special Chapter',
      path: 'chapter/sp',
      chapterNumber: 10,
      releaseTime: null,
    });

    const build = this.newBuild();
    build.baseNames.push('Tyrant', 'Main Story', 'Stella Sora');
    const summaryPayload = this.newPayload(lead, build);
    await this.prepareAndTranslate(build);
    this.finalizeAll(build);

    const cover = await this.resolveCover();
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: this.NOVEL_NAME,
      cover: cover !== '' ? cover : defaultCover,
      summary: summaryPayload.final,
      status: NovelStatus.Ongoing,
      chapters,
    };
    storage.set(this.K_NOVEL, novel, Date.now() + this.NOVEL_TTL);
    return novel;
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const token = chapterPath.replace(/^\/+|\/+$/g, '');
    const cacheKey = this.K_READER + ':' + token;
    const cached = storage.get<string>(cacheKey);
    if (cached !== undefined && cached !== '') return cached;

    const title = this.chapterTitle(token);
    const chapterWiki = await this.fetchWikitext(title);
    const cd = this.parseChapterData(chapterWiki);
    const refs = this.parseStageRefs(chapterWiki);
    if (refs.length === 0) {
      throw new Error('stellasora: no stages found for ' + title);
    }

    const build = this.newBuild();
    const stages: StageContent[] = [];
    let degraded = false;

    for (const ref of refs) {
      const tagline =
        ref.tagline !== null ? this.newPayload(ref.tagline, build) : null;
      if (ref.target === null) {
        stages.push(this.emptyStage(ref, tagline));
        continue;
      }
      try {
        const stageWiki = await this.fetchWikitext(ref.target);
        stages.push(this.parseStagePage(stageWiki, ref, tagline, build));
      } catch (e) {
        console.error('stellasora: stage fetch failed ' + ref.target, e);
        stages.push(this.emptyStage(ref, tagline));
        degraded = true;
      }
    }

    this.collectNames(stages, cd.name ?? '', build);
    const translatedOk = await this.prepareAndTranslate(build);
    if (!translatedOk) degraded = true;

    const imageNames = build.imageNames.slice();
    build.slots.forEach(s => imageNames.push(s.name));
    if (imageNames.length > 0) {
      await this.resolveImages(imageNames, build);
    }
    build.slots.forEach(s => {
      s.url =
        build.resolver.get(this.normalizeImageName(s.name).toLowerCase()) ??
        null;
    });

    this.finalizeAll(build);
    const html = this.renderChapter(stages, build);
    if (!degraded) {
      storage.set(cacheKey, html, Date.now() + this.READER_TTL);
    }
    return html;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo > 1 || !this.matchesSearch(searchTerm)) return [];
    const cover = await this.resolveCover();
    return [
      {
        name: this.NOVEL_NAME,
        path: this.NOVEL_PATH,
        cover: cover !== '' ? cover : defaultCover,
      },
    ];
  }

  resolveUrl = (path: string, isNovel?: boolean): string => {
    if (isNovel) return this.site + 'wiki/Main_Story';
    try {
      return this.site + 'wiki/' + this.chapterTitle(path).replace(/ /g, '_');
    } catch {
      return this.site + 'wiki/Main_Story';
    }
  };
}

export default new StellaSoraPlugin();
