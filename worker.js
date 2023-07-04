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

const { Worker } = require('@ntlab/identity');
const cv = require('@u4/opencv4nodejs');
const debug = require('debug')('identity:worker:face');

function verify(work, start, end) {
    log('FACE> [%d] Verifying %s from %d to %d', Worker.id, work.id, start, end);
    let count = 0;
    let matched = null;
    let images = [];
    let labels = [];
    let current = start;
    try {
        // prepare trained data
        log('FACE> [%d] Preparing data...', Worker.id);
        while (current <= end) {
            images.push(to_matrix(work.items[current]));
            labels.push(current);
            current++;
            count++;
        }
        // create recognizer
        log('FACE> [%d] Creating recognizer...', Worker.id);
        const recognizer = new cv.LBPHFaceRecognizer();
        // train
        log('FACE> [%d] Training recognizer...', Worker.id);
        recognizer.train(images, labels);
        // predict
        log('FACE> [%d] Predicting face...', Worker.id);
        matched = recognizer.predict(to_matrix(work.feature)).label;
        // done
        log('FACE> [%d] Done verifying %d sample(s)', Worker.id, count);
    }
    catch (err) {
        error('FACE> [%d] Err: %s', Worker.id, err);
    }
    Worker.send({cmd: 'done', work: work, matched: matched, worker: Worker.id});
}

function to_matrix(data) {
    if (data.data) {
        data = new Uint8Array(data.data);
    }
    return cv.imdecode(data);
}

function log() {
    debug(...Array.from(arguments));
}

function error() {
    debug(...Array.from(arguments));
}

Worker.on('message', data => {
    switch (data.cmd) {
        case 'do':
            verify(data.work, data.start, data.end);
            break;
        case 'stop':
            log('FACE> [%d] Stopping -- NOP', Worker.id);
            break;
    }
});
