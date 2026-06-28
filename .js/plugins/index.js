"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var indowebnovel_1 = __importDefault(require("@plugins/indonesian/indowebnovel"));
var wtrlab_1 = __importDefault(require("@plugins/indonesian/wtrlab"));
var PLUGINS = [indowebnovel_1.default, wtrlab_1.default];
exports.default = PLUGINS;
