/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2023 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const { Identity } = require('@ntlab/identity');
const fs = require('fs');
const os = require('os');
const path = require('path');
const debug = require('debug')('identity:face');

class FaceId extends Identity {

    VERSION = 'FACEIDENTITY-1.0'

    init() {
        super.init();
        this.id = 'FACE';
        this.proxyServerId = 'FACEIDENTITY';
        this.channelType = 'cluster';
        this.workerOptions = {
            worker: path.join(__dirname, 'worker'),
            maxWorks: 200,
            hasConfidence: true,
        }
    }

    getOpenCv() {
        if (!this.cv) {
            try {
                this.cv = require('@u4/opencv4nodejs');
            }
            catch (err) {
                console.error(`OpenCV failed with ${err}!`);
            }
        }
        return this.cv;
    }

    getCommands() {
        return {
            [Identity.MODE_ALL]: {
                'self-test': data => this.VERSION,
                'connect': data => this.cv ? true : false,
            },
            [Identity.MODE_VERIFIER]: {
                'identify': data => {
                    return this.faceIdentify(this.normalize(data.feature), data.workid);
                },
                'detect': data => {
                    return {face: this.detectFaces(this.normalize(data.feature))};
                },
                'count-template': data => {
                    return {count: this.getIdentifier().count()};
                },
                'reg-template': data => {
                    if (data.id && data.template) {
                        if (data.force && this.getIdentifier().has(data.id)) {
                            this.getIdentifier().remove(data.id);
                        }
                        const success = this.getIdentifier().add(data.id, this.normalizeImage(this.normalize(data.template)));
                        debug(`Register template ${data.id} [${success ? 'OK' : 'FAIL'}]`);
                        if (success) {
                            return {id: data.id};
                        }
                    }
                },
                'unreg-template': data => {
                    if (data.id) {
                        const success = this.getIdentifier().remove(data.id);
                        debug(`Unregister template ${data.id} [${success ? 'OK' : 'FAIL'}]`);
                        if (success) {
                            return {id: data.id};
                        }
                    }
                },
                'has-template': data => {
                    if (data.id) {
                        const success = this.getIdentifier().has(data.id);
                        if (success) {
                            return {id: data.id};
                        }
                    }
                },
                'clear-template': data => {
                    this.getIdentifier().clear();
                    return true;
                }
            }
        }
    }

    normalize(data) {
        if (typeof data === 'string') {
            const buff = new Uint8Array(data.length);
            for (let i = 0; i < data.length; i++) {
                buff[i] = data.charCodeAt(i);
            }
            data = buff;
        }
        return data;
    }

    normalizeImage(img) {
        const cv = this.getOpenCv();
        if (cv) {
            const sz = this.options.size || 80;
            let im = cv.imdecode(img);
            im = im.resize(sz, sz);
            return cv.imencode('.jpg', im);
        }
    }

    getClassifier() {
        if (!this.classifier) {
            const cv = this.getOpenCv();
            if (cv) {
                const classifierModel = this.constructor.translatePath(cv.HAAR_FRONTALFACE_ALT2);
                this.classifier = new cv.CascadeClassifier(classifierModel);
            }
        }
        return this.classifier;
    }

    detectFaces(img) {
        const cv = this.getOpenCv();
        if (cv) {
            let im = cv.imdecode(img);
            im = im.bgrToGray();
            const faceRects = this.getClassifier().detectMultiScale(im).objects;
            if (faceRects.length) {
                const face = im.getRegion(faceRects[0]);
                return cv.imencode('.jpg', face);
            }
        }
    }

    faceIdentify(feature, workid) {
        let face = this.detectFaces(feature, false);
        if (face) {
            return this.getIdentifier().identify(this.fixWorkId(workid), face);
        }
    }

    fixWorkId(workid) {
        if (!workid) {
            workid = Identity.genId();
        }
        return workid;
    }

    onreset() {
        this.doCmd(this.getPrefix('clear-template'));
    }

    static fixOpenCVBinDir(rootDir, debug = false) {
        // disable auto build
        process.env.OPENCV4NODEJS_DISABLE_AUTOBUILD = true;
        if (process.platform === 'win32') {
            // specify OpenCV bin directory
            if (!process.env.OPENCV_BIN_DIR) {
                const opencvRoot = this.translatePath(path.join(rootDir ? rootDir : __dirname, 'opencv', os.arch() === 'ia32' ? 'x86' : 'x64'));
                if (fs.existsSync(opencvRoot)) {
                    const dirs = fs.readdirSync(opencvRoot);
                    for (let i = 0; i < dirs.length; i++) {
                        const opencvBinDir = path.join(opencvRoot, dirs[i], 'bin');
                        if (fs.existsSync(opencvBinDir)) {
                            process.env.OPENCV_BIN_DIR = opencvBinDir;
                            break;
                        }
                    }
                }
            }
            if (!process.env.OPENCV_BIN_DIR) {
                console.error(`No OpenCV binary found, OpenCV may be unusable!`);
            }
        }
        if (debug) {
            process.env.OPENCV4NODES_DEBUG_REQUIRE = true;
        }
    }

    static translatePath(path) {
        return typeof this._translatePath === 'function' ? this._translatePath(path) : path;
    }

    static setPathTranslator(fn) {
        this._translatePath = fn;
    }
}

module.exports = FaceId;