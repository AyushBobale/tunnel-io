(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.TunnelIO = factory());
})(this, (function () { 'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function getDefaultExportFromCjs (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	var src = {};

	var TunnelIO$1 = {};

	var __awaiter = (commonjsGlobal && commonjsGlobal.__awaiter) || function (thisArg, _arguments, P, generator) {
	    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
	    return new (P || (P = Promise))(function (resolve, reject) {
	        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
	        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
	        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
	        step((generator = generator.apply(thisArg, _arguments || [])).next());
	    });
	};
	Object.defineProperty(TunnelIO$1, "__esModule", { value: true });
	TunnelIO$1.TunnelIO = void 0;
	class TunnelIO {
	    constructor(args) {
	        this.CONFIG = {
	            iceServers: [
	                { urls: "stun:stun.l.google.com:19302" },
	                { urls: "stun:stun.services.mozilla.com" },
	            ],
	        };
	        this.LOG_LEVEL = "DEBUG";
	        this.MAX_QUEUE_SIZE = 1024 * 1024;
	        this.name = "noname";
	        this.isInitiator = true;
	        this.fileTransferProtocol = {
	            receivedSize: 0,
	            receivingFiles: null,
	            isProcessing: false,
	            cmds: "noop",
	            filesMeta: {},
	        };
	        this.CHANNELS = {
	            DEFAULT_MSG_CHANNEL: "DEFAULT_MSG_CHANNEL",
	            FILE_TRANSFER: "FILE_TRANSFER",
	        };
	        this.streams = {
	            local: { video: null, screen: null },
	            remote: { video: null, screen: null },
	        };
	        this.dataChannels = {};
	        this.messages = [];
	        const { isInitiator, logLevel, cbs, name } = args;
	        const { onicecandidate, channelEvents, ontrack, fileShareProgress } = cbs || {};
	        this.id = window.crypto.randomUUID();
	        this.name = name || this.name;
	        this.LOG_LEVEL = logLevel || this.LOG_LEVEL;
	        this.isInitiator = isInitiator || false;
	        this.channelEvents = channelEvents;
	        this.fileShareProgress = fileShareProgress;
	        this.peerConnection = new RTCPeerConnection(this.CONFIG);
	        this.peerConnection.onicecandidate = (e) => {
	            this._console("new ice-candidates");
	            this._console(JSON.stringify(this.peerConnection.localDescription));
	            onicecandidate && onicecandidate(this.peerConnection.localDescription);
	        };
	        this.peerConnection.ontrack = (e) => {
	            this._console("Tracks detected");
	            this.streams.remote.video = e.streams[0];
	            ontrack && ontrack(e.streams[0]);
	        };
	        if (this.isInitiator) {
	            this.dataChannels[this.CHANNELS.DEFAULT_MSG_CHANNEL] =
	                this.peerConnection.createDataChannel(this.CHANNELS.DEFAULT_MSG_CHANNEL);
	            this.dataChannels[this.CHANNELS.FILE_TRANSFER] =
	                this.peerConnection.createDataChannel(this.CHANNELS.FILE_TRANSFER);
	            this._bindChannelEvents(this.CHANNELS.DEFAULT_MSG_CHANNEL);
	            this._bindChannelEvents(this.CHANNELS.FILE_TRANSFER);
	            // creating SDP
	            this.peerConnection
	                .createOffer()
	                .then((o) => this.peerConnection.setLocalDescription(o));
	        }
	        else {
	            this.peerConnection.ondatachannel = (e) => {
	                this.dataChannels[e.channel.label] = e.channel;
	                this._bindChannelEvents(e.channel.label);
	            };
	        }
	    }
	    _handleMessage(data) {
	        this.messages.push(JSON.parse(data));
	        this._console(this.messages);
	    }
	    _handleFileTransfer(data) {
	        // there needs to be progress cb here as well
	        // this.fileTransferProtocol.isProcessing = true;
	        // AY make use of this
	        const dataObj = JSON.parse(data);
	        switch (dataObj.cmd) {
	            case "filemeta":
	                this._console("File meta data", dataObj.data);
	                this.fileTransferProtocol.filesMeta = dataObj.data;
	                break;
	            case "filedata":
	                this._console("filedata recevied");
	                const fileData = this.fileTransferProtocol.filesMeta[dataObj.filename];
	                const buffer = this._base64ToArrayBuffer(dataObj.data);
	                if (fileData) {
	                    // @ts-ignore
	                    fileData.buffer.push(buffer);
	                    fileData.progress.receive += buffer.byteLength;
	                    if (fileData.size === fileData.progress.receive) {
	                        const newBlob = new Blob(fileData.buffer, { type: fileData.type });
	                        const link = document.createElement("a");
	                        link.download = fileData.name;
	                        link.href = window.URL.createObjectURL(newBlob);
	                        document.body.appendChild(link);
	                        link.click();
	                        document.body.removeChild(link);
	                    }
	                }
	                this.fileShareProgress &&
	                    this.fileShareProgress({
	                        files: Object.keys(this.fileTransferProtocol.filesMeta).reduce((acc, key) => {
	                            acc[key] = Object.assign(Object.assign({}, this.fileTransferProtocol.filesMeta[key]), { buffer: [] });
	                            return acc;
	                        }, {}),
	                    });
	                // console.log({ fileData });
	                // this._console(this._base64ToArrayBuffer(dataObj.data));
	                break;
	            default:
	                this._console("un-handeled filetransfer cmd", dataObj.cmd);
	                break;
	        }
	    }
	    _bindChannelEvents(channel) {
	        this.dataChannels[channel].onmessage = (e) => {
	            var _a;
	            this._console(`onmessage [${channel}] : `, e.data);
	            switch (channel) {
	                case this.CHANNELS.DEFAULT_MSG_CHANNEL:
	                    this._handleMessage(e.data);
	                    (_a = this.channelEvents) === null || _a === void 0 ? void 0 : _a.onmessage(this.messages);
	                    break;
	                case this.CHANNELS.FILE_TRANSFER:
	                    this._handleFileTransfer(e.data);
	                    break;
	                default:
	                    this._console("un-handeled channel", channel);
	                    break;
	            }
	        };
	        this.dataChannels[channel].onopen = (e) => {
	            var _a;
	            this._console(`channel-open : ${channel}`);
	            (_a = this.channelEvents) === null || _a === void 0 ? void 0 : _a.onopen(e, channel);
	        };
	        this.dataChannels[channel].onclose = (e) => {
	            var _a;
	            this._console(`channel-close : ${channel}`);
	            (_a = this.channelEvents) === null || _a === void 0 ? void 0 : _a.onclose(e, channel);
	        };
	    }
	    _console(...args) {
	        switch (this.LOG_LEVEL) {
	            case "DEBUG":
	                console.log(...args);
	                break;
	            case "PROD":
	                console.warn("Debug level : " + this.LOG_LEVEL);
	                break;
	            default:
	                console.warn("Debug level : " + this.LOG_LEVEL);
	                break;
	        }
	    }
	    setPeer(offer) {
	        return __awaiter(this, void 0, void 0, function* () {
	            // this is setting remote description
	            yield this.peerConnection.setRemoteDescription(offer);
	            this._console("set-remote-desc");
	            if (!this.isInitiator) {
	                this._console("self not-initiator creating answer");
	                const sdp = yield this.createAnswer();
	                this._console("answer created");
	                return sdp;
	            }
	            return null;
	        });
	    }
	    createAnswer() {
	        return __awaiter(this, void 0, void 0, function* () {
	            //create answer
	            const sdp = yield this.peerConnection.createAnswer();
	            yield this.peerConnection.setLocalDescription(sdp);
	            return this.peerConnection.localDescription;
	        });
	    }
	    sendMessage(msg, channel) {
	        if (channel && !this.dataChannels[channel]) {
	            console.error(`No such channel created : ${channel}`);
	            return;
	        }
	        const msgObj = {
	            message: msg,
	            senderId: this.id,
	            senderName: this.name,
	            channel: channel || this.CHANNELS.DEFAULT_MSG_CHANNEL,
	            time: new Date(),
	        };
	        this.messages.push(msgObj);
	        this.dataChannels[channel || this.CHANNELS.DEFAULT_MSG_CHANNEL].send(JSON.stringify(msgObj));
	        return this.messages;
	    }
	    getMediaDevicesVideo() {
	        return __awaiter(this, void 0, void 0, function* () {
	            // renegotiate via webrtc itself
	            const videoStream = yield navigator.mediaDevices.getUserMedia({
	                video: true,
	                // audio: true,
	            });
	            this.streams.local.video = videoStream;
	            this.streams.local.video.getTracks().forEach((track) => {
	                console.log("Track", track);
	                this.peerConnection.addTrack(track, this.streams.local.video || videoStream);
	            });
	            return videoStream;
	        });
	    }
	    _arrayBufferToBase64(buffer) {
	        let binary = "";
	        const bytes = new Uint8Array(buffer);
	        const len = bytes.byteLength;
	        for (let i = 0; i < len; i++) {
	            binary += String.fromCharCode(bytes[i]);
	        }
	        return window.btoa(binary);
	    }
	    _base64ToArrayBuffer(base64) {
	        const binary_string = window.atob(base64);
	        const len = binary_string.length;
	        const bytes = new Uint8Array(len);
	        for (let i = 0; i < len; i++) {
	            bytes[i] = binary_string.charCodeAt(i);
	        }
	        return bytes.buffer;
	    }
	    _createFileMeta(files) {
	        const fileMetaObj = {};
	        for (let i = 0; i < files.length; i++) {
	            const file = files[i];
	            const fileMeta = {
	                name: file.name,
	                size: file.size,
	                type: file.type,
	                lastModified: file.lastModified,
	                progress: { send: 0, receive: 0 },
	            };
	            fileMetaObj[file.name] = Object.assign(Object.assign({}, fileMeta), { buffer: [] });
	        }
	        return fileMetaObj;
	    }
	    sendFiles(files) {
	        // prep send data about files
	        const filesMeta = this._createFileMeta(files);
	        this.dataChannels[this.CHANNELS.FILE_TRANSFER].send(JSON.stringify({ cmd: "filemeta", data: filesMeta }));
	        this.fileTransferProtocol.filesMeta = filesMeta;
	        // const file = files[0];
	        for (let file of files) {
	            // for now just sending the first file can send multiple files
	            this._console(`File is ${[file.name, file.size, file.type, file.lastModified].join(" ")}`);
	            const chunkSize = 8192;
	            let offset = 0;
	            const fileReader = new FileReader();
	            fileReader.addEventListener("error", (error) => {
	                this._console("Error reading file:", error);
	                this.fileShareProgress && this.fileShareProgress({ error, files: {} });
	            });
	            fileReader.addEventListener("abort", (event) => {
	                this._console("File reading aborted:", event);
	                this.fileShareProgress &&
	                    this.fileShareProgress({ error: event, files: {} });
	            });
	            fileReader.addEventListener("load", (e) => {
	                this._console("FileRead.onload ", e);
	                if (e.target && e.target.result instanceof ArrayBuffer) {
	                    let packet = {
	                        cmd: "filedata",
	                        filename: file.name,
	                        data: this._arrayBufferToBase64(e.target.result),
	                    };
	                    this.fileTransferProtocol.filesMeta[file.name].progress.send +=
	                        e.target.result.byteLength;
	                    this.fileShareProgress &&
	                        this.fileShareProgress({
	                            files: this.fileTransferProtocol.filesMeta,
	                        });
	                    // if (
	                    //   this.dataChannels[this.CHANNELS.FILE_TRANSFER].bufferedAmount <
	                    //   this.MAX_QUEUE_SIZE
	                    // ) {
	                    this.dataChannels[this.CHANNELS.FILE_TRANSFER].send(JSON.stringify(packet));
	                    // }
	                    offset += e.target.result.byteLength;
	                    // sendProgress.value = offset;
	                    // AY Set progress here for sender
	                    if (offset < file.size) {
	                        readSlice(offset);
	                    }
	                }
	            });
	            const readSlice = (offset) => {
	                this._console("Slice Number: " + offset);
	                const slice = file.slice(offset, offset + chunkSize);
	                fileReader.readAsArrayBuffer(slice);
	            };
	            readSlice(0);
	        }
	    }
	}
	TunnelIO$1.TunnelIO = TunnelIO;

	(function (exports) {
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.TunnelIO = void 0;
		const TunnelIO_1 = TunnelIO$1;
		Object.defineProperty(exports, "TunnelIO", { enumerable: true, get: function () { return TunnelIO_1.TunnelIO; } }); 
	} (src));

	var index = /*@__PURE__*/getDefaultExportFromCjs(src);

	return index;

}));
