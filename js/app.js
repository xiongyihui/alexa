(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
const player = AVS.Player;

const avs = new AVS({
    debug: true,
    clientId: 'amzn1.application-oa2-client.d4af894584a748a8af9dd3c1a956be76',
    deviceId: 'Alexa',
    deviceSerialNumber: 86,
    redirectUri: location.href.replace(location.hash, "")
});
window.avs = avs;

var recogizer = undefined;
var state = 0;

avs.on(AVS.EventTypes.LOGOUT, () => {
    login();
});

avs.on(AVS.EventTypes.TOKEN_INVALID, () => {
    console.log('invalid token')
    avs.logout()
        .then(login)
});

avs.on(AVS.EventTypes.LOG, log);
avs.on(AVS.EventTypes.ERROR, logError);

function log(message) {
    logOutput.innerHTML = `<li>I: ${message}</li>` + logOutput.innerHTML;
}

function logError(error) {
    logOutput.innerHTML = `<li>E: ${error}</li>` + logOutput.innerHTML;
}

function logAudioBlob(blob, message) {
    return new Promise((resolve, reject) => {
        const a = document.createElement('a');
        const aDownload = document.createElement('a');
        const url = window.URL.createObjectURL(blob);
        const ext = blob.type.indexOf('mpeg') > -1 ? 'mp3' : 'wav';
        const filename = `${Date.now()}.${ext}`;
        a.href = url;
        a.target = '_blank';
        aDownload.href = url;
        a.textContent = filename;
        aDownload.download = filename;
        aDownload.textContent = `download`;

        const sound = document.createElement('audio');
        sound.id = filename;
        sound.controls = 'controls';
        sound.src = url;
        sound.type = blob.type.indexOf('mpeg') > -1 ? 'audio/mpeg' : 'audio/x-wav';

        audioLogOutput.innerHTML = `<li>${message}: ${sound.outerHTML}</li>` + audioLogOutput.innerHTML;
        resolve(blob);
    });
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
        return buffer;
    }

    if (inputSampleRate < outputSampleRate) {
        throw new Error('Output sample rate must be less than input sample rate.');
    }

    const sampleRateRatio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    let result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
        let nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
        let accum = 0;
        let count = 0;

        for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }

        result[offsetResult] = accum / count;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }

    return result;
}

function writeUTFBytes(view, offset, string) {
    const length = string.length;

    for (let i = 0; i < length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function toDataView(raw) {
    const buffer = new ArrayBuffer(44 + raw.length * 2);
    const view = new DataView(buffer);

    /**
     * @credit https://github.com/mattdiamond/Recorderjs
     */
    writeUTFBytes(view, 0, 'RIFF');
    view.setUint32(4, 44 + raw.length * 2, true);
    writeUTFBytes(view, 8, 'WAVE');
    writeUTFBytes(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 16000 * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeUTFBytes(view, 36, 'data');
    view.setUint32(40, raw.length * 2, true);

    const length = raw.length;
    const volume = 1;
    let index = 44;

    for (let i = 0; i < length; i++) {
        view.setInt16(index, raw[i], true);
        index += 2;
    }

    return view;
}

function startRecognizer() {
    console.log('start recognizer');
    state = 0;
    recognizer.postMessage({ command: 'start' });

    progressIcon.style.display = 'none';
    micIcon.style.color = '#00AA72';
    micIcon.style.display = 'block';
}

function stopRecognizer() {
    state = 1;
    recognizer.postMessage({ command: 'stop' });
    micIcon.style.color = 'white';
}

function startUploading() {
    state = 2;
    micIcon.style.display = 'none';
    progressIcon.style.display = 'block';
}

// Define function called by getUserMedia 
function startUserMedia(stream) {
    // Create MediaStreamAudioSourceNode
    var source = audioContext.createMediaStreamSource(stream);
    var innputSampleRate = source.context.sampleRate;
    var outputSampleRate = 16000;

    log('Loading keywrod recogizer...');
    recognizer = new Worker("js/recognizer.js");
    recognizer.onmessage = function(event) {
        switch (event.data.status) {
            case 'ready':
                isRecognizerReady = true;
                console.log('recognizer is ready');
                log('Keyword spotting is ready');
                break;
            case 'recognized':
                console.log(event.data.hyp);
                stopRecognizer();
                break;
            case 'error':
                console.log(event.data.command + ' failed');
                break;
        }
    };
    recognizer.postMessage({ command: 'init' });
    recognizer.postMessage({ command: 'start' });


    var utterance = [];
    var activities = Array(64);
    var activityIndex = 0;

    for (let i = 0; i < activities.length; i++) {
        activities[i] = 0;
    }

    // Setup options
    var options = {
        source: source,
        voice_stop: function() { console.log('voice_stop'); },
        voice_start: function() { console.log('voice_start'); },
        voice_available: (data, active) => {

            // preprocessAudio(data);
            data = downsampleBuffer(data, innputSampleRate, outputSampleRate);
            var result = new Int16Array(data.length);
            for (let i = 0; i < data.length; i++) {
                result[i] = data[i] * 32766;
            }

            activities[activityIndex] = active ? 1 : 0;
            activityIndex = (activityIndex + 1) % activities.length;

            if (activityIndex == 0) {
                console.log(activities);
            }

            if (state == 0) {
                recognizer.postMessage({ command: 'process', data: result });
            } else if (state == 1) {
                let activeActivities = activities.reduce((a, b) => a + b);

                if (activeActivities > 8 && utterance.length < 900) {
                    utterance.push(result);
                } else {
                    if (utterance.length < 32) {
                        console.log('too short utterrance, ignore and start recognizer');
                        startRecognizer();

                        utterance = [];
                        return;
                    }

                    startUploading();

                    let length = utterance.length;
                    let raw = new Int16Array(length * utterance[0].length);
                    let offset = 0;

                    for (let i = 0; i < length; i++) {
                        let buffer = utterance[i];

                        raw.set(buffer, offset);
                        offset += buffer.length;
                    }

                    utterance = [];

                    let dataView = toDataView(raw);


                    avs.audioToBlob(dataView)
                        .then(blob => logAudioBlob(blob, 'U'))
                        // .then(() => avs.player.emptyQueue())
                        // .then(() => avs.player.enqueue(dataView))
                        // .then(() => avs.player.play())

                    var ab = false;
                    avs.sendAudio(dataView)
                        .then(({ xhr, response }) => {

                            var promises = [];
                            var audioMap = {};
                            var directives = null;

                            if (response.multipart.length) {
                                response.multipart.forEach(multipart => {
                                    let body = multipart.body;
                                    if (multipart.headers && multipart.headers['Content-Type'] === 'application/json') {
                                        try {
                                            body = JSON.parse(body);
                                        } catch (error) {
                                            console.error(error);
                                        }

                                        if (body && body.messageBody && body.messageBody.directives) {
                                            directives = body.messageBody.directives;
                                        }
                                    } else if (multipart.headers['Content-Type'] === 'audio/mpeg') {
                                        const start = multipart.meta.body.byteOffset.start;
                                        const end = multipart.meta.body.byteOffset.end;

                                        /**
                                         * Not sure if bug in buffer module or in http message parser
                                         * because it's joining arraybuffers so I have to this to
                                         * seperate them out.
                                         */
                                        var slicedBody = xhr.response.slice(start, end);

                                        //promises.push(avs.player.enqueue(slicedBody));
                                        audioMap[multipart.headers['Content-ID']] = slicedBody;
                                    }
                                });

                                function findAudioFromContentId(contentId) {
                                    contentId = contentId.replace('cid:', '');
                                    for (var key in audioMap) {
                                        if (key.indexOf(contentId) > -1) {
                                            return audioMap[key];
                                        }
                                    }
                                }

                                directives.forEach(directive => {
                                    if (directive.namespace === 'SpeechSynthesizer') {
                                        if (directive.name === 'speak') {
                                            const contentId = directive.payload.audioContent;
                                            const audio = findAudioFromContentId(contentId);
                                            if (audio) {
                                                avs.audioToBlob(audio)
                                                    .then(blob => logAudioBlob(blob, 'A'));
                                                promises.push(avs.player.enqueue(audio));
                                            }
                                        }
                                    } else if (directive.namespace === 'AudioPlayer') {
                                        if (directive.name === 'play') {
                                            const streams = directive.payload.audioItem.streams;
                                            streams.forEach(stream => {
                                                const streamUrl = stream.streamUrl;

                                                const audio = findAudioFromContentId(streamUrl);
                                                if (audio) {
                                                    avs.audioToBlob(audio)
                                                        .then(blob => logAudioBlob(blob, 'RESPONSE'));
                                                    promises.push(avs.player.enqueue(audio));
                                                } else if (streamUrl.indexOf('http') > -1) {
                                                    const xhr = new XMLHttpRequest();
                                                    const url = `/parse-m3u?url=${streamUrl.replace(/!.*$/, '')}`;
                                                    xhr.open('GET', url, true);
                                                    xhr.responseType = 'json';
                                                    xhr.onload = (event) => {
                                                        const urls = event.currentTarget.response;

                                                        urls.forEach(url => {
                                                            avs.player.enqueue(url);
                                                        });
                                                    };
                                                    xhr.send();
                                                }
                                            });
                                        } else if (directive.namespace === 'SpeechRecognizer') {
                                            if (directive.name === 'listen') {
                                                const timeout = directive.payload.timeoutIntervalInMillis;
                                                // enable mic
                                            }
                                        }
                                    }
                                });

                                if (promises.length) {
                                    Promise.all(promises)
                                        .then(() => avs.player.playQueue())
                                        .then(() => {
                                            console.log('finished');
                                            startRecognizer();
                                        });
                                }
                            }

                        })
                        .catch(error => {
                            console.error(error);
                            startRecognizer();
                        });
                }
            }
        }

    };

    // Create VAD
    var vad = new VAD(options);
}

function requestMic() {
    // Create AudioContext
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    window.audioContext = new AudioContext();

    // Ask for audio device
    navigator.getUserMedia = navigator.getUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.webkitGetUserMedia;
    navigator.getUserMedia({ audio: { optional: [{ echoCancellation: true }] } }, startUserMedia, function(e) {
        console.log("No live audio input in this browser: " + e);
    });
}

// const loginBtn = document.getElementById('login');
// const logoutBtn = document.getElementById('logout');
const logOutput = document.getElementById('log');
const audioLogOutput = document.getElementById('audioLog');
const micIcon = document.getElementById('mic');
const progressIcon = document.getElementById('progress');

avs.getTokenFromUrl()
    .then(() => avs.getToken())
    .then(token => localStorage.setItem('token', token))
    .then(() => requestMic())
    .catch(() => {
        const cachedToken = localStorage.getItem('token');

        if (cachedToken) {
            avs.setToken(cachedToken);
            requestMic();
        } else {
            login();
        }


    });

function login() {
    window.location.href = 'login.html';
}

function logout() {
    return avs.logout()
        .then(() => {
            localStorage.removeItem('token');
            login();
        });
}
},{}]},{},[1]);
