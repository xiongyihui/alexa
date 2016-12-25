const AVS = require('alexa-voice-service');
const player = AVS.Player;

const avs = new AVS({
    debug: true,
    clientId: 'amzn1.application-oa2-client.d4af894584a748a8af9dd3c1a956be76',
    deviceId: 'Alexa',
    deviceSerialNumber: 86,
    redirectUri: location.href.replace(location.hash, "")
});
window.avs = avs;

avs.on(AVS.EventTypes.TOKEN_SET, () => {
    loginBtn.disabled = true;
    logoutBtn.disabled = false;
    // startRecording.disabled = false;
    // stopRecording.disabled = true;
});

avs.on(AVS.EventTypes.RECORD_START, () => {
    // startRecording.disabled = true;
    // stopRecording.disabled = false;
});

avs.on(AVS.EventTypes.RECORD_STOP, () => {
    // startRecording.disabled = false;
    // stopRecording.disabled = true;
});

avs.on(AVS.EventTypes.LOGOUT, () => {
    loginBtn.disabled = false;
    logoutBtn.disabled = true;
    // startRecording.disabled = true;
    // stopRecording.disabled = true;
});

avs.on(AVS.EventTypes.TOKEN_INVALID, () => {
    console.log('invalid token')
        // avs.logout()
        // .then(login)
});

avs.on(AVS.EventTypes.LOG, log);
avs.on(AVS.EventTypes.ERROR, logError);

avs.player.on(AVS.Player.EventTypes.LOG, log);
avs.player.on(AVS.Player.EventTypes.ERROR, logError);

avs.player.on(AVS.Player.EventTypes.PLAY, () => {
    playAudio.disabled = true;
    replayAudio.disabled = true;
    pauseAudio.disabled = false;
    stopAudio.disabled = false;
});

avs.player.on(AVS.Player.EventTypes.ENDED, () => {
    playAudio.disabled = true;
    replayAudio.disabled = false;
    pauseAudio.disabled = true;
    stopAudio.disabled = true;
});

avs.player.on(AVS.Player.EventTypes.STOP, () => {
    playAudio.disabled = true;
    replayAudio.disabled = false;
    pauseAudio.disabled = false;
    stopAudio.disabled = false;
});

avs.player.on(AVS.Player.EventTypes.PAUSE, () => {
    playAudio.disabled = false;
    replayAudio.disabled = false;
    pauseAudio.disabled = true;
    stopAudio.disabled = true;
});

avs.player.on(AVS.Player.EventTypes.REPLAY, () => {
    playAudio.disabled = true;
    replayAudio.disabled = true;
    pauseAudio.disabled = false;
    stopAudio.disabled = false;
});

function log(message) {
    logOutput.innerHTML = `<li>LOG: ${message}</li>` + logOutput.innerHTML;
}

function logError(error) {
    logOutput.innerHTML = `<li>ERROR: ${error}</li>` + logOutput.innerHTML;
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

        audioLogOutput.innerHTML = `<li>${message}: ${a.outerHTML} ${aDownload.outerHTML}</li>` + audioLogOutput.innerHTML;
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

// Define function called by getUserMedia 
function startUserMedia(stream) {
    // Create MediaStreamAudioSourceNode
    var source = audioContext.createMediaStreamSource(stream);
    var innputSampleRate = source.context.sampleRate;
    var outputSampleRate = 16000;
    var stage = 0;

    var recognizer = new Worker("js/recognizer.js");
    recognizer.onmessage = function(event) {
        switch (event.data.status) {
            case 'ready':
                isRecognizerReady = true;
                console.log('recognizer is ready');
                break;
            case 'recognized':
                console.log(event.data.hyp);
                stage = 1;
                recognizer.postMessage({ command: 'stop' });
                break;
            case 'error':
                console.log(event.data.command + ' failed');
                break;
        }
    };
    recognizer.postMessage({ command: 'init' });
    recognizer.postMessage({ command: 'start' });


    var utterance = [];

    // Setup options
    var options = {
        source: source,
        voice_stop: function() { console.log('voice_stop'); },
        voice_start: function() { console.log('voice_start'); },
        voice_available: (data, state) => {

            // preprocessAudio(data);
            data = downsampleBuffer(data, innputSampleRate, outputSampleRate);
            var result = new Int16Array(data.length);
            for (let i = 0; i < data.length; i++) {
                result[i] = data[i] * 32766;
            }

            if (stage == 0) {
                recognizer.postMessage({ command: 'process', data: result });
            } else if (stage == 1) {
                if (state) {
                    utterance.push(result);
                } else {
                    stage = 2;
                    if (utterance.length < 20) {
                        console.log('too short utterrance, ignore and start recognizer');
                        stage = 0;
                        recognizer.postMessage({ command: 'start' });
                        return;
                    }

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
                        .then(blob => logAudioBlob(blob, 'VOICE'))
                        // .then(() => avs.player.emptyQueue())
                        // .then(() => avs.player.enqueue(dataView))
                        // .then(() => avs.player.play())
                        .then(() => {
                            // console.log('start recognizer');
                            // stage = 0;
                            // recognizer.postMessage({ command: 'start' });
                        })

                    var ab = false;
                    //sendBlob(blob);
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
                                                    .then(blob => logAudioBlob(blob, 'RESPONSE'));
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

                                            console.log('start recognizer');
                                            stage = 0;
                                            recognizer.postMessage({ command: 'start' });
                                        });
                                }
                            }

                        })
                        .catch(error => {
                            console.error(error);
                            console.log('start recognizer');
                            stage = 0;
                            recognizer.postMessage({ command: 'start' });
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

const loginBtn = document.getElementById('login');
const logoutBtn = document.getElementById('logout');
const logOutput = document.getElementById('log');
const audioLogOutput = document.getElementById('audioLog');
// const startRecording = document.getElementById('startRecording');
// const stopRecording = document.getElementById('stopRecording');
const stopAudio = document.getElementById('stopAudio');
const pauseAudio = document.getElementById('pauseAudio');
const playAudio = document.getElementById('playAudio');
const replayAudio = document.getElementById('replayAudio');

/*
// If using client secret
avs.getCodeFromUrl()
 .then(code => avs.getTokenFromCode(code))
.then(token => localStorage.setItem('token', token))
.then(refreshToken => localStorage.setItem('refreshToken', refreshToken))
.then(() => avs.requestMic())
.then(() => avs.refreshToken())
.catch(() => {

});
*/

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
            // requestMic();
        }


    });

loginBtn.addEventListener('click', login);

function login(event) {
    return avs.login()
        .then(() => avs.requestMic())
        .catch(() => {});

    /*
    // If using client secret
    avs.login({responseType: 'code'})
    .then(() => avs.requestMic())
    .catch(() => {});
    */
}

logoutBtn.addEventListener('click', logout);

function logout() {
    return avs.logout()
        .then(() => {
            localStorage.removeItem('token');
            window.location.hash = '';
        });
}

stopAudio.addEventListener('click', (event) => {
    avs.player.stop();
});

pauseAudio.addEventListener('click', (event) => {
    avs.player.pause();
});

playAudio.addEventListener('click', (event) => {
    avs.player.play();
});

replayAudio.addEventListener('click', (event) => {
    avs.player.replay();
});