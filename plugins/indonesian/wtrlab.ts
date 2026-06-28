import { Plugin } from '@/types/plugin';
import { fetchApi } from '@libs/fetch';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { CheerioAPI, load as parseHTML } from 'cheerio';
import { gcm } from '@libs/aes';

class WTRLAB implements Plugin.PluginBase {
  id = 'WTRLAB';
  name = 'WTR-LAB';
  site = 'https://wtr-lab.com/';
  version = '1.6.3';
  icon = 'src/id/wtrlab/icon.png';
  sourceLang = 'en/';
  baggage = '';
  trace = '';
  private buildId = '';
  private tagIdMap: Map<string, string> = new Map();
  private genreIdMap: Map<string, string> = new Map();

  get headers(): Record<string, string> {
    return {
      baggage: this.baggage,
      'sentry-trace': this.trace,
    };
  }

  async popularNovels(
    page: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    let link = this.site + this.sourceLang + 'novel-list?';

    const params = new URLSearchParams();
    params.append('orderBy', filters.orderBy.value);
    params.append('order', filters.order.value);
    params.append('status', filters.status.value);
    params.append('release_status', filters.release_status.value);
    params.append('addition_age', filters.addition_age.value);
    params.append('page', page.toString());

    if (filters.search.value) {
      params.append('text', filters.search.value);
    }

    if (
      filters.genres.value?.include &&
      filters.genres.value.include.length > 0
    ) {
      params.append('gi', filters.genres.value.include.join(','));
      params.append('gc', filters.genre_operator.value);
    }
    if (
      filters.genres.value?.exclude &&
      filters.genres.value.exclude.length > 0
    ) {
      params.append('ge', filters.genres.value.exclude.join(','));
    }

    if (filters.tags.value?.include && filters.tags.value.include.length > 0) {
      params.append('ti', filters.tags.value.include.join(','));
      params.append('tc', filters.tag_operator.value);
    }
    if (filters.tags.value?.exclude && filters.tags.value.exclude.length > 0) {
      params.append('te', filters.tags.value.exclude.join(','));
    }

    if (filters.folders.value) {
      params.append('folders', filters.folders.value);
    }
    if (filters.library_exclude.value) {
      params.append('le', filters.library_exclude.value);
    }

    if (filters.min_chapters.value) {
      params.append('minc', filters.min_chapters.value);
    }
    if (filters.min_rating.value) {
      params.append('minr', filters.min_rating.value);
    }
    if (filters.min_review_count.value) {
      params.append('minrc', filters.min_review_count.value);
    }

    if (showLatestNovels) {
      const response = await fetchApi(this.site + 'api/home/recent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page: page }),
      });

      const recentNovel: JsonNovel = await response.json();

      const novels: Plugin.NovelItem[] = recentNovel.data.map(
        (datum: Datum) => ({
          name: datum.serie.data.title || datum.serie.slug || '',
          cover: datum.serie.data.image,
          path:
            this.sourceLang +
              'serie-' +
              datum.serie.raw_id +
              '/' +
              datum.serie.slug || '',
        }),
      );

      return novels;
    } else {
      if (!this.buildId) {
        const finderPage = await fetchApi(this.site + 'en/novel-finder').then(
          res => res.text(),
        );
        const finderCheerio = parseHTML(finderPage);
        const nextData = finderCheerio('#__NEXT_DATA__').html();
        if (!nextData) {
          throw new Error('Could not find __NEXT_DATA__ on novel finder page');
        }
        this.buildId = JSON.parse(nextData).buildId;
      }

      link = `${this.site}_next/data/${this.buildId}/en/novel-finder.json?${params.toString()}`;

      const response = await fetchApi(link);
      const json = await response.json();

      if (this.tagIdMap.size === 0 && json.pageProps?.tags?.ungrouped) {
        this.populateTagMap(json);
      }

      const seenIds = new Set();

      const novels: Plugin.NovelItem[] = json.pageProps.series
        .filter((novel: Datum) => {
          if (seenIds.has(novel.raw_id)) {
            return false;
          }
          seenIds.add(novel.raw_id);
          return true;
        })
        .map((novel: Datum) => ({
          name: novel.data.title,
          cover: novel.data.image,
          path: `${this.sourceLang}serie-${novel.raw_id}/${novel.slug}`,
        }));

      return novels;
    }
  }

  private populateTagMap(json: {
    pageProps?: {
      tags?: {
        ungrouped?: { value: number; label: string }[];
        groups?: { id: number; name: string }[];
      };
    };
  }): void {
    const ungrouped = json.pageProps?.tags?.ungrouped ?? [];
    const groups = json.pageProps?.tags?.groups ?? [];

    this.tagIdMap = new Map(ungrouped.map(t => [String(t.value), t.label]));
    this.filters.tags.options = [
      ...ungrouped.map(t => ({ label: t.label, value: String(t.value) })),
      ...groups.map(t => ({ label: t.name, value: String(t.id) })),
    ].sort((a, b) => a.label.localeCompare(b.label));
  }

  async ensureTagMap(): Promise<void> {
    if (this.tagIdMap.size > 0) return;

    if (!this.buildId) {
      const finderPage = await fetchApi(this.site + 'en/novel-finder').then(
        res => res.text(),
      );
      const finderCheerio = parseHTML(finderPage);
      const nextData = finderCheerio('#__NEXT_DATA__').html();
      if (!nextData)
        throw new Error('Could not find __NEXT_DATA__ on novel finder page');
      this.buildId = JSON.parse(nextData).buildId;
    }

    const json = await fetchApi(
      `${this.site}_next/data/${this.buildId}/en/novel-finder.json`,
    ).then(r => r.json());

    this.populateTagMap(json);
  }

  async fetchTokens() {
    const body = await fetchApi(this.site + this.sourceLang).then(res =>
      res.text(),
    );
    const $ = parseHTML(body);

    this.baggage = $('meta[name="baggage"]').attr('content') ?? '';
    this.trace = $('meta[name="sentry-trace"]').attr('content') ?? '';
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const body = await fetchApi(this.site + novelPath).then(res => res.text());
    const loadedCheerio = parseHTML(body);

    const baggage = loadedCheerio('meta[name="baggage"]').attr('content');
    const trace = loadedCheerio('meta[name="sentry-trace"]').attr('content');

    if (baggage && trace) {
      this.baggage = baggage;
      this.trace = trace;
    } else if (!this.baggage || !this.trace) {
      await this.fetchTokens();
    }

    const nextDataElement = loadedCheerio('#__NEXT_DATA__');
    const nextDataText = nextDataElement.html();

    let rawId: number | null = null;
    let slug: string | null = null;
    let chapterCount = 0;

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: loadedCheerio('h1.text-uppercase').text(),
      summary: loadedCheerio('.lead').text().trim(),
    };

    let parsedNextData: NovelJson | null = null;
    if (nextDataText) {
      try {
        parsedNextData = JSON.parse(nextDataText);
      } catch (error) {
        console.error('Failed to parse __NEXT_DATA__:', error);
      }
    }

    if (this.genreIdMap.size === 0) {
      this.genreIdMap = new Map(
        this.filters.genres.options.map(o => [o.value, o.label]),
      );
    }
    if (this.tagIdMap.size === 0) {
      await this.ensureTagMap();
    }

    if (parsedNextData) {
      const serieData = parsedNextData?.props?.pageProps?.serie?.serie_data;

      if (serieData) {
        novel.name = serieData.data?.title || '';
        novel.cover = serieData.data?.image || '';
        novel.summary = serieData.data?.description || '';
        novel.author = serieData.data?.author || '';
        rawId = serieData.raw_id || null;
        slug = serieData.slug || null;
        chapterCount = serieData.chapter_count ?? 0;

        switch (serieData.status) {
          case 0:
            novel.status = 'Ongoing';
            break;
          case 1:
            novel.status = 'Completed';
            break;
          default:
            novel.status = 'Unknown';
        }

        const genreNames = (serieData.genres ?? [])
          .map(id => this.genreIdMap.get(String(id)))
          .filter((name): name is string => !!name);

        const tagNames = (serieData.tags ?? [])
          .map(id => this.tagIdMap.get(String(id)))
          .filter((name): name is string => !!name);

        if (genreNames.length > 0) {
          novel.genres = genreNames.join(', ');
        }
        if (tagNames.length > 0) {
          novel.tags = tagNames.join(', ');
        }
      }
    }

    if (!novel.name) {
      novel.name =
        loadedCheerio('h1.text-uppercase').text() ||
        loadedCheerio('h1.long-title').text() ||
        loadedCheerio('.title-wrap h1').text().trim();
    }

    if (!novel.cover) {
      novel.cover =
        loadedCheerio('.image-wrap img').attr('src') ||
        loadedCheerio('.img-wrap > img').attr('src');
    }

    if (!novel.summary) {
      novel.summary =
        loadedCheerio('.description').text().trim() ||
        loadedCheerio('.desc-wrap .description').text().trim() ||
        loadedCheerio('.lead').text().trim();
    }

    if (!novel.author) {
      novel.author =
        loadedCheerio('td:contains("Author")')
          .next()
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('td:contains("Author") + td')
          .text()
          .replace(/[\t\n]/g, '')
          .trim();
    }

    if (!novel.status) {
      novel.status =
        loadedCheerio('td:contains("Status")')
          .next()
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('td:contains("Status") + td')
          .text()
          .replace(/[\t\n]/g, '')
          .trim() ||
        loadedCheerio('.detail-line:contains("•")')
          .text()
          .match(/•\s*(\w+)/)?.[1] ||
        '';
    }

    const urlMatch = novelPath.match(/serie-(\d+)\/([^/]+)/);
    if (urlMatch) {
      rawId = parseInt(urlMatch[1]);
      slug = urlMatch[2];
    }

    if (chapterCount === 0) {
      const chapterCountText =
        loadedCheerio('.detail-line:contains("Chapters")').text() ||
        loadedCheerio('div:contains("Chapters")').text();
      const chapterCountMatch = chapterCountText.match(/(\d+)\s+Chapters?/i);
      if (chapterCountMatch) {
        chapterCount = parseInt(chapterCountMatch[1]);
      }
    }
    let chapters: Plugin.ChapterItem[] = [];

    if (rawId && slug && chapterCount > 0) {
      try {
        chapters = await this.fetchAllChapters(rawId, chapterCount, slug);
      } catch (error) {
        console.error('Failed to fetch chapters via API:', error);
        chapters = [];
      }
    } else {
      console.warn('Could not extract rawId, slug, or chapterCount from page', {
        rawId,
        slug,
        chapterCount,
      });
    }

    novel.chapters = chapters;

    if (novel.summary) {
      const lines = novel.summary.split('\n').filter(line => line.trim());

      const translated = await this.translate(lines);

      novel.summary = translated
        .map(line => parseHTML(line).text().trim())
        .filter(line => line)
        .join('\n\n');
    }

    return novel;
  }

  async decrypt(encrypted: string, encKey: string) {
    try {
      let isArray = false;
      let payload = encrypted;

      if (encrypted.startsWith('arr:')) {
        isArray = true;
        payload = encrypted.substring(4);
      } else if (encrypted.startsWith('str:')) {
        payload = encrypted.substring(4);
      }

      const parts = payload.split(':');
      if (parts.length !== 3) throw Error('Invalid encrypted data format');

      const [iv, tag, ciphertext] = parts.map(part =>
        Uint8Array.from(atob(part), e => e.charCodeAt(0)),
      );

      const combined = new Uint8Array(ciphertext.length + tag.length);
      combined.set(ciphertext);
      combined.set(tag, ciphertext.length);

      const keyBytes = new TextEncoder().encode(encKey.slice(0, 32));
      const aes = gcm(keyBytes, iv);
      const decrypted = aes.decrypt(combined);
      const plaintext = new TextDecoder().decode(decrypted);

      return isArray ? JSON.parse(plaintext) : plaintext;
    } catch (error) {
      console.error('Client-side decryption error:', error);
      return { error: `<p>Client-side decryption error:</p>${error}` };
    }
  }

  async getKey($: CheerioAPI): Promise<string> {
    const searchKey = 'TextEncoder().encode("';

    const URLs = [
      ...new Set(
        $('head script')
          .toArray()
          .map(el => $(el).attr('src'))
          .filter((src): src is string => !!src),
      ),
    ];

    const results = await Promise.all(
      URLs.map(async src => {
        const raw = await fetchApi(`${this.site}${src}`).then(r => r.text());
        const index = raw.indexOf(searchKey);
        return index >= 0 ? raw.substring(index + 22, index + 54) : null;
      }),
    );

    const encKey = results.find(k => k !== null);
    if (!encKey) encKey = 'IJAFUUxjM25hyzL2AZrn0wl7cESED6Ru';
    return encKey;
  }

  async translate(data: string[]): Promise<string[]> {
    const response = await fetchApi(
      'https://translate-pa.googleapis.com/v1/translateHtml',
      {
        'credentials': 'omit',
        'headers': {
          'content-type': 'application/json+protobuf',
          'X-Goog-API-Key': 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520',
        },
        'referrer': 'https://wtr-lab.com/',
        'body': `[[${JSON.stringify(data)},"auto","id"],"te_lib"]`,
        'method': 'POST',
      },
    );
    const translated = await response.json();
    const out = translated && translated[0] ? translated[0] : [];
    return out as string[];
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    let rawId: number | null = null;
    let chapterNo: number | null = null;
    let loadedCheerio = null;

    const urlMatch = chapterPath.match(/serie-(\d+)\/[^/]+\/chapter-(\d+)/);
    if (urlMatch) {
      rawId = parseInt(urlMatch[1], 10);
      chapterNo = parseInt(urlMatch[2], 10);
    }

    if (!rawId || !chapterNo) {
      const body = await fetchApi(url).then(res => res.text());

      loadedCheerio = parseHTML(body);
      const chapterJson = loadedCheerio('#__NEXT_DATA__').html() + '';
      const jsonData: NovelJson = JSON.parse(chapterJson);

      rawId = jsonData.props.pageProps.serie.chapter.raw_id;
      chapterNo = jsonData.props.pageProps.serie.chapter.order;
    }

    if (!rawId || !chapterNo) {
      const errorMsg = `Missing required parameters for API call from URL '${chapterPath}' - rawId: ${rawId}, chapterNo: ${chapterNo}. Please check the URL format.`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    const translationTypes = ['webplus'];

    let eLog = '';
    let parsedJson;

    for (const type of translationTypes) {
      const apiResponse = await fetchApi(`${this.site}api/reader/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        referrer: url,
        body: JSON.stringify({
          translate: type,
          language: this.sourceLang.replace('/', ''),
          raw_id: rawId,
          chapter_no: chapterNo,
          retry: false,
          force_retry: false,
        }),
      });

      parsedJson = await apiResponse.json();
      if (!apiResponse.ok) {
        if (parsedJson.error) {
          eLog = parsedJson.error;
          continue;
        }
      } else if (!parsedJson.error) {
        break;
      }
    }
    if (parsedJson.success == false) {
      const errorMsg = parsedJson.message;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    let chapterContent = parsedJson.data.data.body;
    const chapterGlossary: ChapterContent['glossary_data'] | undefined =
      parsedJson?.data?.data?.glossary_data;

    let htmlString = '';

    if (
      chapterContent.toString().startsWith('arr:') ||
      chapterContent.toString().startsWith('str:')
    ) {
      if (!loadedCheerio) {
        const body = await fetchApi(url).then(res => res.text());

        loadedCheerio = parseHTML(body);
      }
      const encKey = await this.getKey(loadedCheerio);
      chapterContent = await this.decrypt(chapterContent, encKey);
      if (Object.prototype.hasOwnProperty.call(chapterContent, 'error')) {
        htmlString += `<p>${chapterContent.error.toString()}</p>`;
        return htmlString;
      }
      chapterContent = await this.translate(chapterContent);
    }

    if (eLog !== '') {
      htmlString += `<p style="color:darkred;">${eLog}</p>`;
    }

    const dictionary = chapterGlossary?.terms?.map(t => t[0]) || [];

    for (let text of chapterContent) {
      if (dictionary.length > 0) {
        text = text.replaceAll(
          /(?:wtr-lab\s+)?※([0-9]+)[⛬〓]/g,
          (m: string, index: string) => dictionary[parseInt(index)] || m,
        );
      }
      htmlString += `<p>${text}</p>`;
    }

    return htmlString;
  }

  async fetchAllChapters(
    rawId: number,
    totalChapters: number,
    slug: string,
  ): Promise<Plugin.ChapterItem[]> {
    const batchSize = 250;
    const batches: Array<{ start: number; end: number }> = [];

    for (let start = 1; start <= totalChapters; start += batchSize) {
      batches.push({
        start,
        end: Math.min(start + batchSize - 1, totalChapters),
      });
    }

    const results = await Promise.all(
      batches.map(async ({ start, end }) => {
        try {
          const response = await fetchApi(
            `${this.site}api/chapters/${rawId}?start=${start}&end=${end}`,
            { headers: { ...this.headers } },
          );
          const data = await response.json();
          const chapters = data.chapters ?? data.data?.chapters ?? [];

          if (!Array.isArray(chapters)) return [];

          return chapters.map(
            (apiChapter: ApiChapter): Plugin.ChapterItem => ({
              name: apiChapter.title,
              path: `${this.sourceLang}serie-${rawId}/${slug}/chapter-${apiChapter.order}`,
              releaseTime: apiChapter.updated_at?.substring(0, 10),
              chapterNumber: apiChapter.order,
            }),
          );
        } catch (error) {
          console.error(`Failed to fetch chapters ${start}-${end}:`, error);
          return [];
        }
      }),
    );

    return results
      .flat()
      .sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0));
  }

  async searchNovels(
    searchTerm: string,
    page: number,
  ): Promise<Plugin.NovelItem[]> {
    const filters = {
      ...this.filters,
      search: { ...this.filters.search, value: searchTerm },
    };
    return this.popularNovels(page, { showLatestNovels: false, filters });
  }

  filters = {
    search: {
      value: '',
      label: 'Search',
      type: FilterTypes.TextInput,
    },
    orderBy: {
      value: 'update',
      label: 'Order by',
      options: [
        { label: 'Update Date', value: 'update' },
        { label: 'Addition Date', value: 'date' },
        { label: 'Random', value: 'random' },
        { label: 'Weekly View', value: 'weekly_rank' },
        { label: 'Monthly View', value: 'monthly_rank' },
        { label: 'All-Time View', value: 'view' },
        { label: 'Name', value: 'name' },
        { label: 'Reader', value: 'reader' },
        { label: 'Chapter', value: 'chapter' },
        { label: 'Rating', value: 'rating' },
        { label: 'Review Count', value: 'total_rate' },
        { label: 'Vote Count', value: 'vote' },
      ],
      type: FilterTypes.Picker,
    },
    order: {
      value: 'desc',
      label: 'Order',
      options: [
        { label: 'Descending', value: 'desc' },
        { label: 'Ascending', value: 'asc' },
      ],
      type: FilterTypes.Picker,
    },
    status: {
      value: 'all',
      label: 'Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Hiatus', value: 'hiatus' },
        { label: 'Dropped', value: 'dropped' },
      ],
      type: FilterTypes.Picker,
    },
    release_status: {
      value: 'all',
      label: 'Release Status',
      options: [
        { label: 'All', value: 'all' },
        { label: 'Released', value: 'released' },
        { label: 'On Voting', value: 'voting' },
      ],
      type: FilterTypes.Picker,
    },
    addition_age: {
      value: 'all',
      label: 'Addition Age',
      options: [
        { label: 'All', value: 'all' },
        { label: '< 2 Days', value: 'day' },
        { label: '< 1 Week', value: 'week' },
        { label: '< 1 Month', value: 'month' },
      ],
      type: FilterTypes.Picker,
    },
    min_chapters: {
      value: '',
      label: 'Minimum Chapters',
      type: FilterTypes.TextInput,
    },
    min_rating: {
      value: '',
      label: 'Minimum Rating (0.0-5.0)',
      type: FilterTypes.TextInput,
    },
    min_review_count: {
      value: '',
      label: 'Minimum Review Count',
      type: FilterTypes.TextInput,
    },
    genre_operator: {
      value: 'and',
      label: 'Genre (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },
    genres: {
      label: 'Genres',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: {
        include: [],
        exclude: [],
      },
      options: [
        { label: 'Action', value: '1' },
        { label: 'Adult', value: '2' },
        { label: 'Adventure', value: '3' },
        { label: 'Comedy', value: '4' },
        { label: 'Drama', value: '5' },
        { label: 'Ecchi', value: '6' },
        { label: 'Erciyuan', value: '7' },
        { label: 'Fan-Fiction', value: '8' },
        { label: 'Fantasy', value: '9' },
        { label: 'Game', value: '10' },
        { label: 'Gender-Bender', value: '11' },
        { label: 'Harem', value: '12' },
        { label: 'Historical', value: '13' },
        { label: 'Horror', value: '14' },
        { label: 'Josei', value: '15' },
        { label: 'Martial-Arts', value: '16' },
        { label: 'Mature', value: '17' },
        { label: 'Mecha', value: '18' },
        { label: 'Military', value: '19' },
        { label: 'Mystery', value: '20' },
        { label: 'Psychological', value: '21' },
        { label: 'Romance', value: '22' },
        { label: 'School-Life', value: '23' },
        { label: 'Sci-Fi', value: '24' },
        { label: 'Seinen', value: '25' },
        { label: 'Shoujo', value: '26' },
        { label: 'Shoujo-Ai', value: '27' },
        { label: 'Shounen', value: '28' },
        { label: 'Shounen-Ai', value: '29' },
        { label: 'Slice-Of-Life', value: '30' },
        { label: 'Smut', value: '31' },
        { label: 'Sports', value: '32' },
        { label: 'Supernatural', value: '33' },
        { label: 'Tragedy', value: '34' },
        { label: 'Urban-Life', value: '35' },
        { label: 'Wuxia', value: '36' },
        { label: 'Xianxia', value: '37' },
        { label: 'Xuanhuan', value: '38' },
        { label: 'Yaoi', value: '39' },
        { label: 'Yuri', value: '40' },
      ],
    },
    tag_operator: {
      value: 'and',
      label: 'Tag (And/Or)',
      options: [
        { label: 'And', value: 'and' },
        { label: 'Or', value: 'or' },
      ],
      type: FilterTypes.Picker,
    },

    tags: {
      label: 'Tags',
      type: FilterTypes.ExcludableCheckboxGroup,
      value: {
        include: [],
        exclude: [],
      },
      options: [
        {
          label: '(Load novel list to populate tags)',
          value: '__placeholder__',
        },
      ],
    },

    folders: {
      value: '',
      label: 'Library Folders',
      options: [
        { label: 'No Filter', value: '' },
        { label: 'Reading', value: '1' },
        { label: 'Read Later', value: '2' },
        { label: 'Completed', value: '3' },
        { label: 'Trash', value: '5' },
      ],
      type: FilterTypes.Picker,
    },
    library_exclude: {
      value: '',
      label: 'Library Exclude',
      options: [
        { label: 'None', value: '' },
        { label: 'Exclude All', value: 'history' },
        { label: 'Exclude Trash', value: 'trash' },
        { label: 'Exclude Library & Trash', value: 'in_library' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;
}

type NovelJson = {
  props: Props;
  page: string;
  query?: { raw_id: number };
};

type Props = {
  pageProps: PageProps;
  __N_SSP: boolean;
};

type PageProps = {
  serie: Serie;
  server_time: Date;
};

type Serie = {
  serie_data: SerieData;
  chapter: Chapter;
  recommendation: SerieData[];
  chapter_data: ChapterData;
  id: number;
  raw_id: number;
  slug: string;
  data: Data;
  is_default: boolean;
  raw_type: string;
};

type Chapter = {
  serie_id: number;
  id: number;
  raw_id: number;
  order: number;
  slug: string;
  title: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type ApiChapter = {
  serie_id: number;
  id: number;
  order: number;
  title: string;
  name: string;
  updated_at: string;
};

type ChapterData = {
  data: ChapterContent;
};

type ChapterContent = {
  title: string;
  body: string;
  glossary_data?: {
    terms: string[][];
  };
};

type SerieData = {
  serie_id?: number;
  recommendation_id?: number;
  score?: string;
  id: number;
  slug: string;
  search_text: string;
  status: number;
  data: Data;
  created_at: string;
  updated_at: string;
  view: number;
  in_library: number;
  rating: number | null;
  chapter_count: number;
  power: number;
  total_rate: number;
  user_status: number;
  verified: boolean;
  from: null;
  raw_id: number;
  genres?: number[];
  tags?: number[];
};

type Data = {
  title: string;
  author: string;
  description: string;
  image: string;
};

type JsonNovel = {
  success: boolean;
  data: Datum[];
};

type Datum = {
  serie: Serie;
  chapters: Chapter[];
  updated_at: Date;
  raw_id: number;
  slug: string;
  data: Data;
};

export default new WTRLAB();
