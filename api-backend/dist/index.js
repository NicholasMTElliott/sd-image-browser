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
exports.supportedImages = exports.sourceDir = exports.status = exports.imageLookup = exports.imageTagLookup = void 0;
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const sharp_1 = __importDefault(require("sharp"));
const inventoryImages_1 = require("./inventoryImages");
exports.imageTagLookup = {
    '': []
};
exports.imageLookup = {};
exports.status = { current: 'none' };
const app = (0, express_1.default)();
const port = process.env.PORT || 3000; // default port to listen
exports.sourceDir = process.env.IMAGES_ROOT_DIR || './samples';
exports.supportedImages = ["png", "jpg", "webp", "jpeg", "gif"];
app.get("/api/status", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(exports.status.current));
});
app.get("/api/images", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(Object.values(exports.imageLookup)));
});
app.post("/api/images", (req, res) => {
    (0, inventoryImages_1.inventoryImages)();
    res.statusCode = 204;
    res.end();
});
app.get("/api/tags", (req, res) => {
    res.header('content-type', 'application/json');
    res.send(JSON.stringify(exports.imageTagLookup));
});
app.get("/api/images/:imageId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const image = exports.imageLookup[req.params.imageId];
        console.log(`Mapping ${req.params.imageId}`);
        console.log(`Mapped ${req.params.imageId} to ${image.id} ${image.fullFileName}`);
        res.header('Cache-control', 'public, max-age=86400');
        yield promises_1.default.access(image.fullFileName, promises_1.default.constants.F_OK);
        if (image.extension === 'gif') {
            res.header('content-type', 'image/gif');
            (0, fs_1.createReadStream)(image.fullFileName).pipe(res);
        }
        else if (image.extension === 'webp') {
            res.header('content-type', 'image/webp');
            (0, fs_1.createReadStream)(image.fullFileName).pipe(res);
        }
        else {
            const imageSharp = yield (0, sharp_1.default)(image.fullFileName)
                .webp({ quality: 80 });
            const buffer = yield imageSharp.toBuffer();
            res.header('content-type', 'image/webp');
            res.send(buffer);
        }
    }
    catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end();
    }
}));
app.delete("/api/images/:imageId", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    let responseSent = false;
    try {
        const image = exports.imageLookup[req.params.imageId];
        res.statusCode = 204;
        res.end();
        responseSent = true;
        // Delete should remove every extension matching the file part!
        console.log(`Will delete ${req.params.imageId} at ${image.path}/${image.name}`);
        const dir = yield promises_1.default.opendir(image.path);
        try {
            for (var _d = true, dir_1 = __asyncValues(dir), dir_1_1; dir_1_1 = yield dir_1.next(), _a = dir_1_1.done, !_a;) {
                _c = dir_1_1.value;
                _d = false;
                try {
                    const dirent = _c;
                    if (dirent.name.startsWith(`${image.name}.`)) {
                        console.log(`rm ${image.path}/${dirent.name}`);
                        yield promises_1.default.rm(`${image.path}/${dirent.name}`);
                    }
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = dir_1.return)) yield _b.call(dir_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        delete exports.imageLookup[req.params.imageId];
    }
    catch (err) {
        console.error(err);
        if (!responseSent) {
            res.statusCode = 500;
            res.end();
        }
    }
}));
app.put("/api/images/:imageId/pin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e, e_2, _f, _g;
    try {
        const image = exports.imageLookup[req.params.imageId];
        const destinationPinnedDirectory = `${exports.sourceDir}/_pinned`;
        const newFullFilename = `${exports.sourceDir}/_pinned/_${image.name}.${image.id}.${image.extension}`;
        const originalPath = image.path;
        yield promises_1.default.mkdir(destinationPinnedDirectory, { recursive: true });
        yield promises_1.default.copyFile(image.fullFileName, newFullFilename);
        console.log(`Copied from ${image.fullFileName} to ${newFullFilename}`);
        try {
            yield promises_1.default.copyFile(`${image.path}/${image.name}.txt`, `${destinationPinnedDirectory}/_${image.name}.${image.id}.txt`);
            console.log(`Copied from ${image.path}/${image.name}.txt to ${destinationPinnedDirectory}/_${image.name}.${image.id}.txt`);
        }
        catch (err) { }
        image.fullFileName = newFullFilename;
        image.path = `${exports.sourceDir}/_pinned`;
        res.header('content-type', 'application/json');
        res.send(JSON.stringify(image));
        // clean up any other files with the same prefix
        const dir = yield promises_1.default.opendir(originalPath);
        try {
            for (var _h = true, dir_2 = __asyncValues(dir), dir_2_1; dir_2_1 = yield dir_2.next(), _e = dir_2_1.done, !_e;) {
                _g = dir_2_1.value;
                _h = false;
                try {
                    const dirent = _g;
                    if (dirent.name.startsWith(image.name)) {
                        console.log(`will rm ${originalPath}/${dirent.name}`);
                        yield promises_1.default.rm(`${originalPath}/${dirent.name}`);
                    }
                }
                finally {
                    _h = true;
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_h && !_e && (_f = dir_2.return)) yield _f.call(dir_2);
            }
            finally { if (e_2) throw e_2.error; }
        }
    }
    catch (err) {
        res.statusCode = 500;
        res.end();
        console.error(err);
    }
}));
// start the Express server
app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
});
(0, inventoryImages_1.inventoryImages)().then(() => {
    setInterval(() => (0, inventoryImages_1.inventoryImages)(), 1000 * 60 * 10);
});
