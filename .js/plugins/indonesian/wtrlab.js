"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var fetch_1 = require("@libs/fetch");
var filterInputs_1 = require("@libs/filterInputs");
var cheerio_1 = require("cheerio");
var aes_1 = require("@libs/aes");
var storage_1 = require("@libs/storage");
var novelStatus_1 = require("@libs/novelStatus");
var WTRLAB = /** @class */ (function () {
    function WTRLAB() {
        this.id = 'WTRLAB';
        this.name = 'WTR-LAB';
        this.site = 'https://wtr-lab.com/';
        this.version = '1.7.2';
        this.icon = 'src/id/wtrlab/icon.png';
        this.sourceLang = 'en/';
        this.webStorageUtilized = true;
        this.imageRequestInit = {
            headers: { Referer: this.site },
        };
        this.baggage = '';
        this.trace = '';
        this.buildId = '';
        this.tagIdMap = new Map();
        this.genreIdMap = new Map();
        this.G_KEY = 'AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520';
        this.G_URL = 'https://translate-pa.googleapis.com/v1/translateHtml';
        // Storage keys (per-plugin namespace)
        this.K_TOKENS = 'wtrlab:tokens';
        this.K_BUILD = 'wtrlab:buildId';
        this.K_TERMS = 'wtrlab:terms';
        this.K_CHAPTERS = 'wtrlab:chapters';
        this.K_READER = 'wtrlab:reader';
        this.K_TR = 'wtrlab:tr';
        // TTLs in milliseconds (converted to epoch expiry for storage.set)
        this.TOKEN_TTL = 10 * 60 * 1000;
        this.BUILD_TTL = 60 * 60 * 1000;
        this.CHAPTERS_TTL = 60 * 60 * 1000;
        this.READER_TTL = 30 * 24 * 60 * 60 * 1000;
        this.TERMS_TTL = 365 * 24 * 60 * 60 * 1000;
        this.memCache = new Map();
        this.filters = {
            search: {
                value: '',
                label: 'Search',
                type: filterInputs_1.FilterTypes.TextInput,
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
                type: filterInputs_1.FilterTypes.Picker,
            },
            order: {
                value: 'desc',
                label: 'Order',
                options: [
                    { label: 'Descending', value: 'desc' },
                    { label: 'Ascending', value: 'asc' },
                ],
                type: filterInputs_1.FilterTypes.Picker,
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
                type: filterInputs_1.FilterTypes.Picker,
            },
            release_status: {
                value: 'all',
                label: 'Release Status',
                options: [
                    { label: 'All', value: 'all' },
                    { label: 'Released', value: 'released' },
                    { label: 'On Voting', value: 'voting' },
                ],
                type: filterInputs_1.FilterTypes.Picker,
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
                type: filterInputs_1.FilterTypes.Picker,
            },
            min_chapters: {
                value: '',
                label: 'Minimum Chapters',
                type: filterInputs_1.FilterTypes.TextInput,
            },
            min_rating: {
                value: '',
                label: 'Minimum Rating (0.0-5.0)',
                type: filterInputs_1.FilterTypes.TextInput,
            },
            min_review_count: {
                value: '',
                label: 'Minimum Review Count',
                type: filterInputs_1.FilterTypes.TextInput,
            },
            genre_operator: {
                value: 'and',
                label: 'Genre (And/Or)',
                options: [
                    { label: 'And', value: 'and' },
                    { label: 'Or', value: 'or' },
                ],
                type: filterInputs_1.FilterTypes.Picker,
            },
            genres: {
                label: 'Genres',
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
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
                type: filterInputs_1.FilterTypes.Picker,
            },
            tags: {
                label: 'Tags',
                type: filterInputs_1.FilterTypes.ExcludableCheckboxGroup,
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
                type: filterInputs_1.FilterTypes.Picker,
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
                type: filterInputs_1.FilterTypes.Picker,
            },
        };
    }
    Object.defineProperty(WTRLAB.prototype, "headers", {
        get: function () {
            return {
                baggage: this.baggage,
                'sentry-trace': this.trace,
            };
        },
        enumerable: false,
        configurable: true
    });
    /** Headers used on every JSON API call: tokens + referrer (anti Cloudflare/Turnstile). */
    WTRLAB.prototype.apiHeaders = function (referrer) {
        var headers = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
        if (this.baggage)
            headers.baggage = this.baggage;
        if (this.trace)
            headers['sentry-trace'] = this.trace;
        if (referrer)
            headers.Referer = referrer;
        return headers;
    };
    /** Cache-before-fetch with in-memory + persistent storage layers. */
    WTRLAB.prototype.cachedFetch = function (url, init, cache) {
        return __awaiter(this, void 0, void 0, function () {
            var key, ttlMs, mem, persisted, res, data;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        key = (_a = cache === null || cache === void 0 ? void 0 : cache.key) !== null && _a !== void 0 ? _a : "f:".concat(url);
                        ttlMs = (_b = cache === null || cache === void 0 ? void 0 : cache.ttlMs) !== null && _b !== void 0 ? _b : 15 * 60 * 1000;
                        mem = this.memCache.get(key);
                        if (mem && mem.expires > Date.now())
                            return [2 /*return*/, mem.value];
                        persisted = storage_1.storage.get(key);
                        if (persisted !== undefined) {
                            this.memCache.set(key, { value: persisted, expires: Date.now() + ttlMs });
                            return [2 /*return*/, persisted];
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url, init)];
                    case 1:
                        res = _c.sent();
                        return [4 /*yield*/, res.json()];
                    case 2:
                        data = (_c.sent());
                        this.memCache.set(key, { value: data, expires: Date.now() + ttlMs });
                        storage_1.storage.set(key, data, Date.now() + ttlMs);
                        return [2 /*return*/, data];
                }
            });
        });
    };
    /** Fetch and cache the Sentry tokens (baggage + sentry-trace) the site expects. */
    WTRLAB.prototype.fetchTokens = function () {
        return __awaiter(this, arguments, void 0, function (force) {
            var body, $, baggage, trace, _a;
            var _b, _c;
            if (force === void 0) { force = false; }
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!force && this.baggage && this.trace)
                            return [2 /*return*/];
                        _d.label = 1;
                    case 1:
                        _d.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + this.sourceLang, {
                                headers: { accept: 'text/html' },
                            }).then(function (res) { return res.text(); })];
                    case 2:
                        body = _d.sent();
                        $ = (0, cheerio_1.load)(body);
                        baggage = (_b = $('meta[name="baggage"]').attr('content')) !== null && _b !== void 0 ? _b : '';
                        trace = (_c = $('meta[name="sentry-trace"]').attr('content')) !== null && _c !== void 0 ? _c : '';
                        if (baggage && trace) {
                            this.baggage = baggage;
                            this.trace = trace;
                            storage_1.storage.set(this.K_TOKENS, { baggage: baggage, trace: trace }, Date.now() + this.TOKEN_TTL);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        _a = _d.sent();
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /** Make sure tokens exist (memory -> storage -> fresh fetch), never blocks on empty. */
    WTRLAB.prototype.ensureTokens = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cached;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.baggage && this.trace)
                            return [2 /*return*/];
                        cached = storage_1.storage.get(this.K_TOKENS);
                        if ((cached === null || cached === void 0 ? void 0 : cached.baggage) && (cached === null || cached === void 0 ? void 0 : cached.trace)) {
                            this.baggage = cached.baggage;
                            this.trace = cached.trace;
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.fetchTokens()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /** JS buildId used by the _next/data API (cached in memory + storage). */
    WTRLAB.prototype.getBuildId = function () {
        return __awaiter(this, arguments, void 0, function (force) {
            var cached, finderPage, finderCheerio, nextData;
            if (force === void 0) { force = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.buildId && !force)
                            return [2 /*return*/, this.buildId];
                        if (!this.buildId) {
                            cached = storage_1.storage.get(this.K_BUILD);
                            if (cached) {
                                this.buildId = cached;
                                return [2 /*return*/, cached];
                            }
                        }
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + 'en/novel-finder').then(function (res) {
                                return res.text();
                            })];
                    case 1:
                        finderPage = _a.sent();
                        finderCheerio = (0, cheerio_1.load)(finderPage);
                        nextData = finderCheerio('#__NEXT_DATA__').html();
                        if (!nextData) {
                            throw new Error('Could not find __NEXT_DATA__ on novel finder page');
                        }
                        this.buildId = JSON.parse(nextData).buildId;
                        storage_1.storage.set(this.K_BUILD, this.buildId, Date.now() + this.BUILD_TTL);
                        return [2 /*return*/, this.buildId];
                }
            });
        });
    };
    /** Full status mapping verified against the site (0..3). */
    WTRLAB.prototype.statusLabel = function (status) {
        switch (status) {
            case 0:
                return novelStatus_1.NovelStatus.Ongoing;
            case 1:
                return novelStatus_1.NovelStatus.Completed;
            case 2:
                return novelStatus_1.NovelStatus.OnHiatus;
            case 3:
                return novelStatus_1.NovelStatus.Cancelled;
            default:
                return novelStatus_1.NovelStatus.Unknown;
        }
    };
    WTRLAB.prototype.popularNovels = function (page_1, _a) {
        return __awaiter(this, arguments, void 0, function (page, _b) {
            var params, response, recentNovel, novels, buildId, link, json, seenIds_1, novels;
            var _this = this;
            var _c, _d, _e, _f, _g, _h, _j;
            var showLatestNovels = _b.showLatestNovels, filters = _b.filters;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        params = new URLSearchParams();
                        params.append('orderBy', filters.orderBy.value);
                        params.append('order', filters.order.value);
                        params.append('status', filters.status.value);
                        params.append('release_status', filters.release_status.value);
                        params.append('addition_age', filters.addition_age.value);
                        params.append('page', page.toString());
                        if (filters.search.value) {
                            params.append('text', filters.search.value);
                        }
                        if (((_c = filters.genres.value) === null || _c === void 0 ? void 0 : _c.include) &&
                            filters.genres.value.include.length > 0) {
                            params.append('gi', filters.genres.value.include.join(','));
                            params.append('gc', filters.genre_operator.value);
                        }
                        if (((_d = filters.genres.value) === null || _d === void 0 ? void 0 : _d.exclude) &&
                            filters.genres.value.exclude.length > 0) {
                            params.append('ge', filters.genres.value.exclude.join(','));
                        }
                        if (((_e = filters.tags.value) === null || _e === void 0 ? void 0 : _e.include) && filters.tags.value.include.length > 0) {
                            params.append('ti', filters.tags.value.include.join(','));
                            params.append('tc', filters.tag_operator.value);
                        }
                        if (((_f = filters.tags.value) === null || _f === void 0 ? void 0 : _f.exclude) && filters.tags.value.exclude.length > 0) {
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
                        if (!showLatestNovels) return [3 /*break*/, 4];
                        // Home "recent" endpoint is Cloudflare-guarded: requires tokens.
                        return [4 /*yield*/, this.ensureTokens()];
                    case 1:
                        // Home "recent" endpoint is Cloudflare-guarded: requires tokens.
                        _k.sent();
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + 'api/home/recent', {
                                method: 'POST',
                                headers: this.apiHeaders(),
                                body: JSON.stringify({ page: page }),
                            })];
                    case 2:
                        response = _k.sent();
                        return [4 /*yield*/, response.json()];
                    case 3:
                        recentNovel = _k.sent();
                        novels = ((_g = recentNovel.data) !== null && _g !== void 0 ? _g : []).map(function (datum) { return ({
                            name: _this.resolveTemplates(datum.serie.data.title || datum.serie.slug) ||
                                '',
                            cover: datum.serie.data.image,
                            path: _this.sourceLang +
                                'serie-' +
                                datum.serie.raw_id +
                                '/' +
                                datum.serie.slug || '',
                        }); });
                        return [2 /*return*/, novels];
                    case 4: return [4 /*yield*/, this.getBuildId()];
                    case 5:
                        buildId = _k.sent();
                        link = "".concat(this.site, "_next/data/").concat(buildId, "/en/novel-finder.json?").concat(params.toString());
                        return [4 /*yield*/, this.cachedFetch(link, undefined, {
                                key: "list:".concat(page, ":").concat(params.toString()),
                                ttlMs: 5 * 60 * 1000,
                            })];
                    case 6:
                        json = _k.sent();
                        if (this.tagIdMap.size === 0 && ((_j = (_h = json.pageProps) === null || _h === void 0 ? void 0 : _h.tags) === null || _j === void 0 ? void 0 : _j.ungrouped)) {
                            this.populateTagMap(json);
                        }
                        seenIds_1 = new Set();
                        novels = json.pageProps.series
                            .filter(function (novel) {
                            if (seenIds_1.has(novel.raw_id)) {
                                return false;
                            }
                            seenIds_1.add(novel.raw_id);
                            return true;
                        })
                            .map(function (novel) { return ({
                            name: _this.resolveTemplates(novel.data.title),
                            cover: novel.data.image,
                            path: "".concat(_this.sourceLang, "serie-").concat(novel.raw_id, "/").concat(novel.slug),
                        }); });
                        return [2 /*return*/, novels];
                }
            });
        });
    };
    WTRLAB.prototype.populateTagMap = function (json) {
        var _a, _b, _c, _d, _e, _f;
        var ungrouped = (_c = (_b = (_a = json.pageProps) === null || _a === void 0 ? void 0 : _a.tags) === null || _b === void 0 ? void 0 : _b.ungrouped) !== null && _c !== void 0 ? _c : [];
        var groups = (_f = (_e = (_d = json.pageProps) === null || _d === void 0 ? void 0 : _d.tags) === null || _e === void 0 ? void 0 : _e.groups) !== null && _f !== void 0 ? _f : [];
        this.tagIdMap = new Map(ungrouped.map(function (t) { return [String(t.value), t.label]; }));
        this.filters.tags.options = __spreadArray(__spreadArray([], ungrouped.map(function (t) { return ({ label: t.label, value: String(t.value) }); }), true), groups.map(function (t) { return ({ label: t.name, value: String(t.id) }); }), true).sort(function (a, b) { return a.label.localeCompare(b.label); });
    };
    WTRLAB.prototype.ensureTagMap = function () {
        return __awaiter(this, void 0, void 0, function () {
            var buildId, json;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.tagIdMap.size > 0)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.getBuildId()];
                    case 1:
                        buildId = _a.sent();
                        return [4 /*yield*/, this.cachedFetch("".concat(this.site, "_next/data/").concat(buildId, "/en/novel-finder.json"), undefined, { key: "tags:".concat(buildId), ttlMs: 30 * 60 * 1000 })];
                    case 2:
                        json = _a.sent();
                        this.populateTagMap(json);
                        return [2 /*return*/];
                }
            });
        });
    };
    WTRLAB.prototype.fetchNovelFromFinder = function (rawId, slug) {
        return __awaiter(this, void 0, void 0, function () {
            var buildId, searchText, params, json;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.getBuildId().catch(function () { return ''; })];
                    case 1:
                        buildId = _c.sent();
                        searchText = slug.replace(/-/g, ' ');
                        params = new URLSearchParams({ text: searchText, page: '1' });
                        return [4 /*yield*/, this.cachedFetch("".concat(this.site, "_next/data/").concat(buildId, "/en/novel-finder.json?").concat(params), undefined, { key: "finder:".concat(rawId), ttlMs: 30 * 60 * 1000 }).catch(function () { return null; })];
                    case 2:
                        json = _c.sent();
                        if (!Array.isArray((_a = json === null || json === void 0 ? void 0 : json.pageProps) === null || _a === void 0 ? void 0 : _a.series))
                            return [2 /*return*/, null];
                        return [2 /*return*/, ((_b = json.pageProps.series.find(function (s) { return s.raw_id === rawId; })) !== null && _b !== void 0 ? _b : null)];
                }
            });
        });
    };
    WTRLAB.prototype.parseNovel = function (novelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var body, loadedCheerio, baggage, trace, nextDataElement, nextDataText, rawId, slug, chapterCount, novel, parsedNextData, serieData, genreNames, tagNames, urlMatch, finderData, genreNames, tagNames, error_1, chapterCountText, chapterCountMatch, chapters, error_2, lines, translated;
            var _this = this;
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
            return __generator(this, function (_u) {
                switch (_u.label) {
                    case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)(this.site + novelPath).then(function (res) { return res.text(); })];
                    case 1:
                        body = _u.sent();
                        loadedCheerio = (0, cheerio_1.load)(body);
                        baggage = loadedCheerio('meta[name="baggage"]').attr('content');
                        trace = loadedCheerio('meta[name="sentry-trace"]').attr('content');
                        if (!(baggage && trace)) return [3 /*break*/, 2];
                        this.baggage = baggage;
                        this.trace = trace;
                        storage_1.storage.set(this.K_TOKENS, { baggage: baggage, trace: trace }, Date.now() + this.TOKEN_TTL);
                        return [3 /*break*/, 4];
                    case 2:
                        if (!(!this.baggage || !this.trace)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.fetchTokens()];
                    case 3:
                        _u.sent();
                        _u.label = 4;
                    case 4:
                        nextDataElement = loadedCheerio('#__NEXT_DATA__');
                        nextDataText = nextDataElement.html();
                        rawId = null;
                        slug = null;
                        chapterCount = 0;
                        novel = {
                            path: novelPath,
                            name: this.resolveTemplates(loadedCheerio('h1.text-uppercase').text()),
                            summary: this.resolveTemplates(loadedCheerio('.lead').text().trim()),
                        };
                        parsedNextData = null;
                        if (nextDataText) {
                            try {
                                parsedNextData = JSON.parse(nextDataText);
                            }
                            catch (error) {
                                console.error('Failed to parse __NEXT_DATA__:', error);
                            }
                        }
                        if (this.genreIdMap.size === 0) {
                            this.genreIdMap = new Map(this.filters.genres.options.map(function (o) { return [o.value, o.label]; }));
                        }
                        if (!(this.tagIdMap.size === 0)) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.ensureTagMap()];
                    case 5:
                        _u.sent();
                        _u.label = 6;
                    case 6:
                        if (parsedNextData) {
                            serieData = (_c = (_b = (_a = parsedNextData === null || parsedNextData === void 0 ? void 0 : parsedNextData.props) === null || _a === void 0 ? void 0 : _a.pageProps) === null || _b === void 0 ? void 0 : _b.serie) === null || _c === void 0 ? void 0 : _c.serie_data;
                            if (serieData) {
                                novel.name = this.resolveTemplates(((_d = serieData.data) === null || _d === void 0 ? void 0 : _d.title) || '');
                                novel.cover = ((_e = serieData.data) === null || _e === void 0 ? void 0 : _e.image) || '';
                                novel.summary = this.resolveTemplates(((_f = serieData.data) === null || _f === void 0 ? void 0 : _f.description) || '');
                                novel.author = this.resolveTemplates(((_g = serieData.data) === null || _g === void 0 ? void 0 : _g.author) || '');
                                rawId = serieData.raw_id || null;
                                slug = serieData.slug || null;
                                chapterCount = (_h = serieData.chapter_count) !== null && _h !== void 0 ? _h : 0;
                                novel.status = this.statusLabel(serieData.status);
                                genreNames = ((_j = serieData.genres) !== null && _j !== void 0 ? _j : [])
                                    .map(function (id) { return _this.genreIdMap.get(String(id)); })
                                    .filter(function (name) { return !!name; });
                                tagNames = ((_k = serieData.tags) !== null && _k !== void 0 ? _k : [])
                                    .map(function (id) { return _this.tagIdMap.get(String(id)); })
                                    .filter(function (name) { return !!name; });
                                if (genreNames.length > 0) {
                                    novel.genres = genreNames.join(', ');
                                }
                                if (tagNames.length > 0) {
                                    novel.tags = tagNames.join(', ');
                                }
                            }
                        }
                        if (!novel.name) {
                            novel.name = this.resolveTemplates(loadedCheerio('h1.text-uppercase').text() ||
                                loadedCheerio('h1.long-title').text() ||
                                loadedCheerio('.title-wrap h1').text().trim());
                        }
                        if (!novel.cover) {
                            novel.cover =
                                loadedCheerio('.image-wrap img').attr('src') ||
                                    loadedCheerio('.img-wrap > img').attr('src');
                        }
                        if (!novel.summary) {
                            novel.summary = this.resolveTemplates(loadedCheerio('.description').text().trim() ||
                                loadedCheerio('.desc-wrap .description').text().trim() ||
                                loadedCheerio('.lead').text().trim());
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
                                    ((_l = loadedCheerio('.detail-line:contains("•")')
                                        .text()
                                        .match(/•\s*(\w+)/)) === null || _l === void 0 ? void 0 : _l[1]) ||
                                    '';
                        }
                        urlMatch = novelPath.match(/serie-(\d+)\/([^/]+)/);
                        if (urlMatch) {
                            rawId = parseInt(urlMatch[1]);
                            slug = urlMatch[2];
                        }
                        if (!(!novel.name && rawId && slug)) return [3 /*break*/, 10];
                        _u.label = 7;
                    case 7:
                        _u.trys.push([7, 9, , 10]);
                        return [4 /*yield*/, this.fetchNovelFromFinder(rawId, slug)];
                    case 8:
                        finderData = _u.sent();
                        if (finderData) {
                            novel.name = this.resolveTemplates(((_m = finderData.data) === null || _m === void 0 ? void 0 : _m.title) || '');
                            novel.cover = ((_o = finderData.data) === null || _o === void 0 ? void 0 : _o.image) || '';
                            novel.summary = this.resolveTemplates(((_p = finderData.data) === null || _p === void 0 ? void 0 : _p.description) || '');
                            novel.author = this.resolveTemplates(((_q = finderData.data) === null || _q === void 0 ? void 0 : _q.author) || '');
                            slug = finderData.slug || slug;
                            chapterCount = (_r = finderData.chapter_count) !== null && _r !== void 0 ? _r : 0;
                            novel.status = this.statusLabel(finderData.status);
                            genreNames = ((_s = finderData.genres) !== null && _s !== void 0 ? _s : [])
                                .map(function (id) { return _this.genreIdMap.get(String(id)); })
                                .filter(function (name) { return !!name; });
                            tagNames = ((_t = finderData.tags) !== null && _t !== void 0 ? _t : [])
                                .map(function (id) { return _this.tagIdMap.get(String(id)); })
                                .filter(function (name) { return !!name; });
                            if (genreNames.length > 0)
                                novel.genres = genreNames.join(', ');
                            if (tagNames.length > 0)
                                novel.tags = tagNames.join(', ');
                        }
                        return [3 /*break*/, 10];
                    case 9:
                        error_1 = _u.sent();
                        console.error('Fallback fetchNovelFromFinder failed:', error_1);
                        return [3 /*break*/, 10];
                    case 10:
                        if (chapterCount === 0) {
                            chapterCountText = loadedCheerio('.detail-line:contains("Chapters")').text() ||
                                loadedCheerio('div:contains("Chapters")').text();
                            chapterCountMatch = chapterCountText.match(/(\d+)\s+Chapters?/i);
                            if (chapterCountMatch) {
                                chapterCount = parseInt(chapterCountMatch[1]);
                            }
                        }
                        chapters = [];
                        if (!(rawId && slug && chapterCount > 0)) return [3 /*break*/, 15];
                        _u.label = 11;
                    case 11:
                        _u.trys.push([11, 13, , 14]);
                        return [4 /*yield*/, this.fetchAllChapters(rawId, chapterCount, slug)];
                    case 12:
                        chapters = _u.sent();
                        return [3 /*break*/, 14];
                    case 13:
                        error_2 = _u.sent();
                        console.error('Failed to fetch chapters via API:', error_2);
                        chapters = [];
                        return [3 /*break*/, 14];
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        console.warn('Could not extract rawId, slug, or chapterCount from page', {
                            rawId: rawId,
                            slug: slug,
                            chapterCount: chapterCount,
                        });
                        _u.label = 16;
                    case 16:
                        novel.chapters = chapters;
                        if (!novel.summary) return [3 /*break*/, 18];
                        lines = novel.summary.split('\n').filter(function (line) { return line.trim(); });
                        return [4 /*yield*/, this.translate(lines)];
                    case 17:
                        translated = _u.sent();
                        novel.summary = translated
                            .map(function (line) { return (0, cheerio_1.load)(line).text().trim(); })
                            .filter(function (line) { return line; })
                            .join('\n\n');
                        _u.label = 18;
                    case 18: return [2 /*return*/, novel];
                }
            });
        });
    };
    WTRLAB.prototype.decrypt = function (encrypted, encKey) {
        return __awaiter(this, void 0, void 0, function () {
            var isArray, payload, parts, _a, iv, tag, ciphertext, combined, keyBytes, aes, decrypted, plaintext;
            return __generator(this, function (_b) {
                try {
                    isArray = false;
                    payload = encrypted;
                    if (encrypted.startsWith('arr:')) {
                        isArray = true;
                        payload = encrypted.substring(4);
                    }
                    else if (encrypted.startsWith('str:')) {
                        payload = encrypted.substring(4);
                    }
                    parts = payload.split(':');
                    if (parts.length !== 3)
                        throw Error('Invalid encrypted data format');
                    _a = parts.map(function (part) {
                        return Uint8Array.from(atob(part), function (e) { return e.charCodeAt(0); });
                    }), iv = _a[0], tag = _a[1], ciphertext = _a[2];
                    combined = new Uint8Array(ciphertext.length + tag.length);
                    combined.set(ciphertext);
                    combined.set(tag, ciphertext.length);
                    keyBytes = new TextEncoder().encode(encKey.slice(0, 32));
                    aes = (0, aes_1.gcm)(keyBytes, iv);
                    decrypted = aes.decrypt(combined);
                    plaintext = new TextDecoder().decode(decrypted);
                    return [2 /*return*/, isArray ? JSON.parse(plaintext) : plaintext];
                }
                catch (error) {
                    console.error('Client-side decryption error:', error);
                    return [2 /*return*/, { error: "<p>Client-side decryption error:</p>".concat(error) }];
                }
                return [2 /*return*/];
            });
        });
    };
    WTRLAB.prototype.getKey = function ($) {
        return __awaiter(this, void 0, void 0, function () {
            var searchKey, URLs, results, encKey;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        searchKey = 'TextEncoder().encode("';
                        URLs = __spreadArray([], new Set($('head script')
                            .toArray()
                            .map(function (el) { return $(el).attr('src'); })
                            .filter(function (src) { return !!src; })), true);
                        return [4 /*yield*/, Promise.all(URLs.map(function (src) { return __awaiter(_this, void 0, void 0, function () {
                                var raw, index;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(this.site).concat(src)).then(function (r) { return r.text(); })];
                                        case 1:
                                            raw = _a.sent();
                                            index = raw.indexOf(searchKey);
                                            return [2 /*return*/, index >= 0 ? raw.substring(index + 22, index + 54) : null];
                                    }
                                });
                            }); }))];
                    case 1:
                        results = _a.sent();
                        encKey = results.find(function (k) { return k !== null; });
                        if (!encKey)
                            encKey = 'IJAFUUxjM25hyzL2AZrn0wl7cESED6Ru';
                        return [2 /*return*/, encKey];
                }
            });
        });
    };
    /** Decode a (possibly URL-safe, possibly unpadded) base64 string to UTF-8 text. */
    WTRLAB.prototype.decodeB64 = function (b64) {
        try {
            var normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
            var padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            var bin = atob(padded);
            var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
            return new TextDecoder().decode(bytes);
        }
        catch (_a) {
            return '';
        }
    };
    /**
     * Resolve site template strings like `%{Soul Land|RG91bHVvIERhbHU}`
     * to their localized display title (`Soul Land`). The second part is a
     * base64-encoded alternative/raw name (e.g. `Douluo Dalu`).
     */
    WTRLAB.prototype.resolveTemplates = function (input) {
        var _this = this;
        if (typeof input !== 'string' || input.indexOf('%{') === -1)
            return input;
        return input.replace(/%\{([^}|]*)\|([^}]*)\}/g, function (_match, partA, partB) {
            var display = (partA !== null && partA !== void 0 ? partA : '').trim();
            if (display)
                return display;
            var decoded = _this.decodeB64(partB !== null && partB !== void 0 ? partB : '');
            return decoded || partB || '';
        });
    };
    /** Hash helper used to cache translated batches (avoid Google spam detection). */
    WTRLAB.prototype.simpleHash = function (input) {
        var hash = 0;
        for (var i = 0; i < input.length; i++) {
            hash = (hash << 5) - hash + input.charCodeAt(i);
            hash |= 0;
        }
        return (hash >>> 0).toString(36);
    };
    WTRLAB.prototype.translate = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, response, translated, out;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cacheKey = "".concat(this.K_TR, ":").concat(this.simpleHash(data.join('\u0001')));
                        cached = storage_1.storage.get(cacheKey);
                        if (cached)
                            return [2 /*return*/, cached];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(this.G_URL, {
                                'credentials': 'omit',
                                'headers': {
                                    'content-type': 'application/json+protobuf',
                                    'X-Goog-API-Key': this.G_KEY,
                                },
                                'referrer': 'https://wtr-lab.com/',
                                'body': "[[".concat(JSON.stringify(data), ",\"auto\",\"id\"],\"te_lib\"]"),
                                'method': 'POST',
                            })];
                    case 1:
                        response = _a.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        translated = _a.sent();
                        out = translated && translated[0] ? translated[0] : [];
                        storage_1.storage.set(cacheKey, out, Date.now() + this.READER_TTL);
                        return [2 /*return*/, out];
                }
            });
        });
    };
    /**
     * Resolve glossary terms for a chapter.
     * Chosen translation per RAW term is persisted, so a character name picked once
     * stays identical across every chapter (raw = the candidate containing CJK, or
     * the first candidate; default choice = earliest/language-matching candidate).
     */
    WTRLAB.prototype.resolveTerms = function (terms) {
        var _a;
        var dict = [];
        if (!(terms === null || terms === void 0 ? void 0 : terms.length))
            return dict;
        var saved = (_a = storage_1.storage.get(this.K_TERMS)) !== null && _a !== void 0 ? _a : {};
        var dirty = false;
        terms.forEach(function (row, i) {
            var _a;
            var cands = (row !== null && row !== void 0 ? row : []).filter(function (c) { return typeof c === 'string' && c.trim() !== ''; });
            if (!cands.length)
                return;
            var rawKey = (_a = cands.find(function (c) { return /[\u3400-\u9FFF]/.test(c); })) !== null && _a !== void 0 ? _a : cands[0];
            var chosen = saved[rawKey];
            if (!chosen || !cands.includes(chosen)) {
                chosen = cands[0];
                saved[rawKey] = chosen;
                dirty = true;
            }
            dict[i] = chosen;
        });
        if (dirty) {
            storage_1.storage.set(this.K_TERMS, saved, Date.now() + this.TERMS_TTL);
        }
        return dict;
    };
    WTRLAB.prototype.resolveChapterImageUrl = function (url) {
        if (/^https?:\/\//i.test(url))
            return url;
        // Legacy importer stored paths like `rss./web/novel/images/...`;
        // strip the dead `rss.` prefix and resolve against the site root.
        var cleaned = url.replace(/^rss\./i, '').replace(/^\.\//, '');
        return this.site + cleaned.replace(/^\/+/, '');
    };
    WTRLAB.prototype.parseChapter = function (chapterPath) {
        return __awaiter(this, void 0, void 0, function () {
            var CHAPTER_IMG_TOKEN, url, rawId, chapterNo, loadedCheerio, urlMatch, body_1, baggage, trace, chapterJson, jsonData, errorMsg, htmlCacheKey, cachedHtml, translationTypes, eLog, parsedJson, _i, translationTypes_1, type, apiResponse, errorMsg, body, errMsg, chapterContent, chapterGlossary, htmlString, illustrationSlots, body_2, encKey, decrypted, paragraphs, translatable, chapterImages, dictionary, _a, chapterImages_1, imageSrc, _b, _c, text;
            var _this = this;
            var _d, _e, _f, _g, _h, _j;
            return __generator(this, function (_k) {
                switch (_k.label) {
                    case 0:
                        CHAPTER_IMG_TOKEN = function (index) { return "__WTRLABIMG".concat(index, "__"); };
                        url = this.site + chapterPath;
                        rawId = null;
                        chapterNo = null;
                        loadedCheerio = null;
                        urlMatch = chapterPath.match(/serie-(\d+)\/[^/]+\/chapter-(\d+)/);
                        if (urlMatch) {
                            rawId = parseInt(urlMatch[1], 10);
                            chapterNo = parseInt(urlMatch[2], 10);
                        }
                        if (!(!rawId || !chapterNo)) return [3 /*break*/, 2];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 1:
                        body_1 = _k.sent();
                        loadedCheerio = (0, cheerio_1.load)(body_1);
                        baggage = loadedCheerio('meta[name="baggage"]').attr('content');
                        trace = loadedCheerio('meta[name="sentry-trace"]').attr('content');
                        if (baggage && trace) {
                            this.baggage = baggage;
                            this.trace = trace;
                            storage_1.storage.set(this.K_TOKENS, { baggage: baggage, trace: trace }, Date.now() + this.TOKEN_TTL);
                        }
                        chapterJson = loadedCheerio('#__NEXT_DATA__').html() + '';
                        jsonData = JSON.parse(chapterJson);
                        rawId = jsonData.props.pageProps.serie.chapter.raw_id;
                        chapterNo = jsonData.props.pageProps.serie.chapter.order;
                        _k.label = 2;
                    case 2:
                        if (!rawId || !chapterNo) {
                            errorMsg = "Missing required parameters for API call from URL '".concat(chapterPath, "' - rawId: ").concat(rawId, ", chapterNo: ").concat(chapterNo, ". Please check the URL format.");
                            console.error(errorMsg);
                            throw new Error(errorMsg);
                        }
                        htmlCacheKey = "".concat(this.K_READER, ":").concat(rawId, ":").concat(chapterNo);
                        cachedHtml = storage_1.storage.get(htmlCacheKey);
                        if (cachedHtml)
                            return [2 /*return*/, cachedHtml];
                        return [4 /*yield*/, this.ensureTokens()];
                    case 3:
                        _k.sent();
                        translationTypes = ['webplus'];
                        eLog = '';
                        _i = 0, translationTypes_1 = translationTypes;
                        _k.label = 4;
                    case 4:
                        if (!(_i < translationTypes_1.length)) return [3 /*break*/, 8];
                        type = translationTypes_1[_i];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(this.site, "api/reader/get"), {
                                method: 'POST',
                                headers: this.apiHeaders(url),
                                body: JSON.stringify({
                                    translate: type,
                                    language: this.sourceLang.replace('/', ''),
                                    raw_id: rawId,
                                    chapter_no: chapterNo,
                                    retry: false,
                                    force_retry: false,
                                }),
                            })];
                    case 5:
                        apiResponse = _k.sent();
                        return [4 /*yield*/, apiResponse.json()];
                    case 6:
                        parsedJson = _k.sent();
                        if (!apiResponse.ok) {
                            if (parsedJson.error) {
                                eLog = parsedJson.error;
                                return [3 /*break*/, 7];
                            }
                        }
                        else if (!parsedJson.error) {
                            return [3 /*break*/, 8];
                        }
                        _k.label = 7;
                    case 7:
                        _i++;
                        return [3 /*break*/, 4];
                    case 8:
                        if ((parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.success) == false) {
                            errorMsg = parsedJson.message;
                            console.error(errorMsg);
                            throw new Error(errorMsg);
                        }
                        body = (_e = (_d = parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.data) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.body;
                        if (typeof body !== 'string' || !body) {
                            errMsg = 'Empty or missing chapter body from API response. The site may have blocked the request — try again later.';
                            console.error(errMsg, {
                                success: parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.success,
                                apiError: parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.error,
                            });
                            return [2 /*return*/, "<p style=\"color:darkred;\">".concat(errMsg, "</p>")];
                        }
                        chapterContent = body;
                        chapterGlossary = (_g = (_f = parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.data) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.glossary_data;
                        htmlString = '';
                        illustrationSlots = [];
                        if (!(chapterContent.toString().startsWith('arr:') ||
                            chapterContent.toString().startsWith('str:'))) return [3 /*break*/, 14];
                        if (!!loadedCheerio) return [3 /*break*/, 10];
                        return [4 /*yield*/, (0, fetch_1.fetchApi)(url).then(function (res) { return res.text(); })];
                    case 9:
                        body_2 = _k.sent();
                        loadedCheerio = (0, cheerio_1.load)(body_2);
                        _k.label = 10;
                    case 10: return [4 /*yield*/, this.getKey(loadedCheerio)];
                    case 11:
                        encKey = _k.sent();
                        return [4 /*yield*/, this.decrypt(chapterContent.toString(), encKey)];
                    case 12:
                        decrypted = _k.sent();
                        if (Object.prototype.hasOwnProperty.call(decrypted, 'error')) {
                            htmlString += "<p>".concat(decrypted.error, "</p>");
                            return [2 /*return*/, htmlString];
                        }
                        paragraphs = typeof decrypted === 'string' ? [decrypted] : decrypted;
                        translatable = paragraphs.map(function (paragraph) {
                            return paragraph.replace(/\[img(?:=(\d+),(\d+))?\]([^\[]+?)\[\/img\]/g, function (_marker, width, height, imageUrl) {
                                illustrationSlots.push({
                                    src: _this.resolveChapterImageUrl(imageUrl.trim()),
                                    width: width ? parseInt(width, 10) : undefined,
                                    height: height ? parseInt(height, 10) : undefined,
                                });
                                return CHAPTER_IMG_TOKEN(illustrationSlots.length - 1);
                            });
                        });
                        return [4 /*yield*/, this.translate(translatable)];
                    case 13:
                        chapterContent = _k.sent();
                        _k.label = 14;
                    case 14:
                        chapterImages = (_j = (_h = parsedJson === null || parsedJson === void 0 ? void 0 : parsedJson.data) === null || _h === void 0 ? void 0 : _h.data) === null || _j === void 0 ? void 0 : _j.images;
                        if (eLog !== '') {
                            htmlString += "<p style=\"color:darkred;\">".concat(eLog, "</p>");
                        }
                        dictionary = this.resolveTerms(chapterGlossary === null || chapterGlossary === void 0 ? void 0 : chapterGlossary.terms);
                        if (Array.isArray(chapterImages)) {
                            for (_a = 0, chapterImages_1 = chapterImages; _a < chapterImages_1.length; _a++) {
                                imageSrc = chapterImages_1[_a];
                                if (typeof imageSrc === 'string' && imageSrc.length > 0) {
                                    htmlString += "<p><img src=\"".concat(imageSrc, "\" loading=\"lazy\" alt=\"illustration\" /></p>");
                                }
                            }
                        }
                        for (_b = 0, _c = Array.isArray(chapterContent)
                            ? chapterContent
                            : [chapterContent]; _b < _c.length; _b++) {
                            text = _c[_b];
                            if (dictionary.length > 0) {
                                text = text.replaceAll(/(?:wtr-lab\s+)?※([0-9]+)[⛬〓]/g, function (m, index) { return dictionary[parseInt(index)] || m; });
                            }
                            if (illustrationSlots.length > 0) {
                                // Tolerant restore: translators may inject spaces or alter case.
                                text = text.replace(/__WTRLABIMG\s*(\d+)\s__/gi, function (token, index) {
                                    var slot = illustrationSlots[parseInt(index, 10)];
                                    if (!slot)
                                        return token;
                                    var dims = (slot.width ? " width=\"".concat(slot.width, "\"") : '') +
                                        (slot.height ? " height=\"".concat(slot.height, "\"") : '');
                                    return "<img src=\"".concat(slot.src, "\" loading=\"lazy\" alt=\"illustration\"").concat(dims, " />");
                                });
                            }
                            htmlString += "<p>".concat(text, "</p>");
                        }
                        if (htmlString) {
                            storage_1.storage.set(htmlCacheKey, htmlString, Date.now() + this.READER_TTL);
                        }
                        return [2 /*return*/, htmlString];
                }
            });
        });
    };
    WTRLAB.prototype.fetchAllChapters = function (rawId, totalChapters, slug) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheKey, cached, batchSize, batches, start, results, chapters;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cacheKey = "".concat(this.K_CHAPTERS, ":").concat(rawId);
                        cached = storage_1.storage.get(cacheKey);
                        if (cached)
                            return [2 /*return*/, cached];
                        batchSize = 250;
                        batches = [];
                        for (start = 1; start <= totalChapters; start += batchSize) {
                            batches.push({
                                start: start,
                                end: Math.min(start + batchSize - 1, totalChapters),
                            });
                        }
                        return [4 /*yield*/, Promise.all(batches.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                                var response, data, chapters_1, error_3;
                                var _this = this;
                                var _c, _d, _e;
                                var start = _b.start, end = _b.end;
                                return __generator(this, function (_f) {
                                    switch (_f.label) {
                                        case 0:
                                            _f.trys.push([0, 3, , 4]);
                                            return [4 /*yield*/, (0, fetch_1.fetchApi)("".concat(this.site, "api/chapters/").concat(rawId, "?start=").concat(start, "&end=").concat(end), { headers: __assign({}, this.headers) })];
                                        case 1:
                                            response = _f.sent();
                                            return [4 /*yield*/, response.json()];
                                        case 2:
                                            data = _f.sent();
                                            chapters_1 = (_e = (_c = data.chapters) !== null && _c !== void 0 ? _c : (_d = data.data) === null || _d === void 0 ? void 0 : _d.chapters) !== null && _e !== void 0 ? _e : [];
                                            if (!Array.isArray(chapters_1))
                                                return [2 /*return*/, []];
                                            return [2 /*return*/, chapters_1.map(function (apiChapter) {
                                                    var _a;
                                                    return ({
                                                        name: apiChapter.title,
                                                        path: "".concat(_this.sourceLang, "serie-").concat(rawId, "/").concat(slug, "/chapter-").concat(apiChapter.order),
                                                        releaseTime: (_a = apiChapter.updated_at) === null || _a === void 0 ? void 0 : _a.substring(0, 10),
                                                        chapterNumber: apiChapter.order,
                                                    });
                                                })];
                                        case 3:
                                            error_3 = _f.sent();
                                            console.error("Failed to fetch chapters ".concat(start, "-").concat(end, ":"), error_3);
                                            return [2 /*return*/, []];
                                        case 4: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                    case 1:
                        results = _a.sent();
                        chapters = results
                            .flat()
                            .sort(function (a, b) { return (a.chapterNumber || 0) - (b.chapterNumber || 0); });
                        if (chapters.length > 0) {
                            storage_1.storage.set(cacheKey, chapters, Date.now() + this.CHAPTERS_TTL);
                        }
                        return [2 /*return*/, chapters];
                }
            });
        });
    };
    WTRLAB.prototype.searchNovels = function (searchTerm, page) {
        return __awaiter(this, void 0, void 0, function () {
            var filters;
            return __generator(this, function (_a) {
                filters = __assign(__assign({}, this.filters), { search: __assign(__assign({}, this.filters.search), { value: searchTerm }) });
                return [2 /*return*/, this.popularNovels(page, { showLatestNovels: false, filters: filters })];
            });
        });
    };
    return WTRLAB;
}());
exports.default = new WTRLAB();
