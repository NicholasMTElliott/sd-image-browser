"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const sharp_1 = __importDefault(require("sharp"));
const uuid_1 = require("uuid");
const foundImages = [];
const imageTagLookup = {
    '': []
};
const imageLookup = {};
let status = 'none';
const app = (0, express_1.default)();
const port = process.env.PORT || 3000; // default port to listen
const sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
const supportedImages = ["png", "jpg", "webp", "jpeg", "gif"];
const iterateDirectory = (dirent, path) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    var _d;
    if (dirent.isDirectory()) {
        console.log(`Scanning ${dirent.name} and ${path}`);
        console.log(dirent.name);
        if (dirent.name[0] != '.') {
            const subpath = path + '/' + dirent.name;
            const dir = yield promises_1.default.opendir(subpath);
            try {
                for (var _e = true, dir_1 = __asyncValues(dir), dir_1_1; dir_1_1 = yield dir_1.next(), _a = dir_1_1.done, !_a;) {
                    _c = dir_1_1.value;
                    _e = false;
                    try {
                        const subdir = _c;
                        iterateDirectory(subdir, subpath);
                    }
                    finally {
                        _e = true;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_e && !_a && (_b = dir_1.return)) yield _b.call(dir_1);
                }
                finally { if (e_1) throw e_1.error; }
            }
        }
    }
    else if (dirent.isFile()) {
        const fileParts = dirent.name.split('.');
        const extension = fileParts[fileParts.length - 1].toLowerCase();
        const namePart = fileParts.slice(0, fileParts.length - 1).join('.');
        if (supportedImages.indexOf(extension) >= 0) {
            console.log(`File ${namePart} is a ${extension} at ${path}`);
            // process this image!
            // try and read any associated attribute information
            let tags = [];
            try {
                const tagsFile = yield promises_1.default.readFile(`${path}/${namePart}.txt`);
                const fileContents = tagsFile.toString('utf-8');
                tags = fileContents.split('\n')[0].split(/[,|]/).map(tag => tag.toLowerCase().trim());
            }
            catch (_f) { }
            const fullFileName = `${path}/${namePart}.${extension}`;
            const id = (0, uuid_1.v4)();
            const thumbnailBuffer = yield (0, sharp_1.default)(fullFileName)
                .resize(128, 128, { fit: 'contain' })
                .jpeg({ quality: 60 })
                .toBuffer();
            const imageIndex = foundImages.length;
            const thumbnailImage = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
            foundImages.push({
                id,
                fullFileName,
                path,
                name: namePart,
                extension,
                tags,
                preview: thumbnailImage
            });
            for (const tag of tags) {
                imageTagLookup[tag] = [...((_d = imageTagLookup[tag]) !== null && _d !== void 0 ? _d : []), imageIndex];
            }
            if (tags.length == 0) {
                imageTagLookup[''].push(imageIndex);
            }
            imageLookup[id] = imageIndex;
        }
    }
});
const inventoryImages = () => __awaiter(void 0, void 0, void 0, function* () {
    var _g, e_2, _h, _j;
    status = 'processing';
    try {
        const dir = yield promises_1.default.opendir(sourceDir);
        try {
            for (var _k = true, dir_2 = __asyncValues(dir), dir_2_1; dir_2_1 = yield dir_2.next(), _g = dir_2_1.done, !_g;) {
                _j = dir_2_1.value;
                _k = false;
                try {
                    const dirent = _j;
                    iterateDirectory(dirent, sourceDir);
                }
                finally {
                    _k = true;
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_k && !_g && (_h = dir_2.return)) yield _h.call(dir_2);
            }
            finally { if (e_2) throw e_2.error; }
        }
        status = 'done';
    }
    catch (err) {
        status = 'error';
        console.error(err);
    }
});
app.get("/api/status", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(status));
});
app.get("/api/images", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(foundImages));
});
app.get("/api/tags", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(imageTagLookup));
});
app.get("/api/images/:imageId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const idx = imageLookup[req.params.imageId];
    const image = foundImages[idx];
    const buffer = yield (0, sharp_1.default)(image.fullFileName)
        .png()
        .toBuffer();
    res.header('content-type', 'image/png');
    res.send(buffer);
}));
// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});
inventoryImages();
