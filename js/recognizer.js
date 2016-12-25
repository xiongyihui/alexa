var recognizer = undefined
var buffer = undefined
var recognized = -1
var post = this.postMessage

this.onmessage = function(event) {
    switch (event.data.command) {
        case 'init':
            init();
            break
        case 'start':
            start()
            break
        case 'stop':
            stop()
            break
        case 'process':
            process(event.data.data)
            break
    }
}

function init() {
    importScripts('pocketsphinx.js');

    buffer = new Module.AudioBuffer()
    var config = new Module.Config()

    config.push_back(["-kws_threshold", "1e-32"])
    config.push_back(["-vad_threshold", "6"])
    recognizer = new Module.Recognizer(config)
    config.delete()

    if (recognizer == undefined) {
        post({ status: 'error', command: 'init', code: Module.ReturnType.RUNTIME_ERROR })
        return
    }

    var words = new Module.VectorWords()
    words.push_back(['ALEXA', 'AH L EH K S AH'])
    var output = recognizer.addWords(words)
    words.delete()

    if (output != Module.ReturnType.SUCCESS)
        post({ status: 'error', command: 'init', code: output })


    var id = new Module.Integers()
    output = recognizer.addKeyword(id, 'ALEXA')
    if (output == Module.ReturnType.SUCCESS) {
        console.log('search keyword id:' + id.get(0))
        output = recognizer.switchSearch(id.get(0))
    }
    id.delete()

    if (output != Module.ReturnType.SUCCESS) {
        post({ status: 'error', command: 'init', code: output })
        return
    }

    post({ status: 'ready' })
}


function start() {
    if (recognizer) {
        var output = recognizer.start()
        if (output != Module.ReturnType.SUCCESS)
            post({ status: 'error', command: 'start', code: output })
    } else {
        post({ status: 'error', command: 'start', code: 'js-no-recognizer' })
    }
}

function stop() {
    if (recognizer) {
        var output = recognizer.stop()
        if (output != Module.ReturnType.SUCCESS)
            post({ status: 'error', command: 'stop', code: output })
        else
            post({ status: 'stoped', hyp: recognizer.getHyp(), final: true })
    } else {
        post({ status: 'error', command: 'stop', code: 'js-no-recognizer' })
    }
}

function process(array) {
    if (recognizer) {
        while (buffer.size() < array.length)
            buffer.push_back(0)
        for (var i = 0; i < array.length; i++)
            buffer.set(i, array[i])
        var output = recognizer.process(buffer)
        if (output == Module.ReturnType.SUCCESS) {
            // post({ status: 'recognized', hyp: recognizer.getHyp() })

            var hyp = recognizer.getHyp()
            var position = hyp.lastIndexOf('ALEXA')
            if (recognized != position) {
                recognized = position
                if (position >= 0) {
                    post({ status: 'recognized', hyp: hyp })
                }
            }
        } else {
            post({ status: 'error', command: 'process', code: output })
        }
    } else {
        post({ status: 'error', command: 'process', code: 'js-no-recognizer' })
    }
}