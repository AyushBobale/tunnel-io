type FilesMeta = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  progress: { send: number; receive: number };
};

export type FileShareProgessArgs = {
  error?: any;
  files: { [key: string]: FilesMeta };
};

export type FileShareProgessFunc = (args: FileShareProgessArgs) => void;

export type MessageType = {
  senderId: string;
  senderName?: string;
  message: string;
  channel: string;
  time: Date;
};

export type ChannelEventsType = {
  onmessage: (e: MessageType[]) => void;
  onopen: (e: Event, channel: string) => void;
  onclose: (e: Event, channel: string) => void;
};

export type CBsType = {
  onicecandidate: (sdp: RTCSessionDescription | null) => void;
  ontrack: (stream: MediaStream) => void;
  channelEvents: ChannelEventsType;
};

export type TunnelIOArgs = {
  isInitiator?: boolean;
  name?: string;
  logLevel?: "DEBUG" | "PROD";
};

export type TunnelHookArgs = {
  cbs?: CBsType;
};

export class TunnelIO {
  private LOG_LEVEL: "DEBUG" | "PROD" = "DEBUG";
  private MAX_QUEUE_SIZE = 1024 * 1024;
  private id: string;
  private name: string = "noname";
  private isInitiator: boolean = true;
  private fileTransferProtocol: {
    receivedSize: number;
    receivingFiles: FileList | null;
    isProcessing: boolean;
    cmds: "filemeta" | "filedata" | "noop";
    filesMeta: { [key: string]: FilesMeta & { buffer: [] } };
  } = {
    receivedSize: 0,
    receivingFiles: null,
    isProcessing: false,
    cmds: "noop",
    filesMeta: {},
  };
  private CHANNELS = {
    DEFAULT_MSG_CHANNEL: "DEFAULT_MSG_CHANNEL",
    FILE_TRANSFER: "FILE_TRANSFER",
  };
  private streams: {
    local: { video: MediaStream | null; screen: MediaStream | null };
    remote: { video: MediaStream | null; screen: MediaStream | null };
  } = {
    local: { video: null, screen: null },
    remote: { video: null, screen: null },
  };
  private peerConnection: RTCPeerConnection;
  private dataChannels: { [key: string]: RTCDataChannel } = {};
  private messages: MessageType[] = [];
  private channelEvents: ChannelEventsType | undefined;

  constructor(args: TunnelIOArgs & TunnelHookArgs) {
    const { isInitiator, logLevel, cbs, name } = args;
    const { onicecandidate, channelEvents, ontrack } = cbs || {};

    this.id = window.crypto.randomUUID();
    this.name = name || this.name;
    this.LOG_LEVEL = logLevel || this.LOG_LEVEL;
    this.isInitiator = isInitiator || false;
    this.channelEvents = channelEvents;
    this.peerConnection = new RTCPeerConnection();

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
        this.peerConnection.createDataChannel(
          this.CHANNELS.DEFAULT_MSG_CHANNEL
        );
      this.dataChannels[this.CHANNELS.FILE_TRANSFER] =
        this.peerConnection.createDataChannel(this.CHANNELS.FILE_TRANSFER);
      this._bindChannelEvents(this.CHANNELS.DEFAULT_MSG_CHANNEL);
      this._bindChannelEvents(this.CHANNELS.FILE_TRANSFER);

      // creating SDP
      this.peerConnection
        .createOffer()
        .then((o) => this.peerConnection.setLocalDescription(o));
    } else {
      this.peerConnection.ondatachannel = (e) => {
        this.dataChannels[e.channel.label] = e.channel;
        this._bindChannelEvents(e.channel.label);
      };
    }
  }

  private _handleMessage(data: any) {
    this.messages.push(JSON.parse(data));
    this._console(this.messages);
  }

  private _handleFileTransfer(data: any) {
    // there needs to be progress cb here as well
    // this.fileTransferProtocol.isProcessing = true;
    // AY make use of this
    const dataObj: any = JSON.parse(data);
    switch (dataObj.cmd) {
      case "filemeta":
        this._console("File meta data", dataObj.data);
        this.fileTransferProtocol.filesMeta = dataObj.data;
        break;
      case "filedata":
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
        console.log({ fileData });
        this._console(this._base64ToArrayBuffer(dataObj.data));
        break;
      default:
        this._console("un-handeled filetransfer cmd", dataObj.cmd);
        break;
    }
  }

  private _bindChannelEvents(channel: string) {
    this.dataChannels[channel].onmessage = (e) => {
      this._console(`onmessage [${channel}] : `, e.data);
      switch (channel) {
        case this.CHANNELS.DEFAULT_MSG_CHANNEL:
          this._handleMessage(e.data);
          this.channelEvents?.onmessage(this.messages);
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
      this._console(`channel-open : ${channel}`);
      this.channelEvents?.onopen(e, channel);
    };
    this.dataChannels[channel].onclose = (e) => {
      this._console(`channel-close : ${channel}`);
      this.channelEvents?.onclose(e, channel);
    };
  }

  private _console(...args: any[]) {
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

  public async setPeer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescription | null> {
    // this is setting remote description
    await this.peerConnection.setRemoteDescription(offer);
    this._console("set-remote-desc");
    if (!this.isInitiator) {
      this._console("self not-initiator creating answer");
      const sdp = await this.createAnswer();
      this._console("answer created");
      return sdp;
    }
    return null;
  }

  private async createAnswer(): Promise<RTCSessionDescription | null> {
    //create answer
    const sdp = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(sdp);
    return this.peerConnection.localDescription;
  }

  public sendMessage(msg: string, channel?: string): MessageType[] | undefined {
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
    this.dataChannels[channel || this.CHANNELS.DEFAULT_MSG_CHANNEL].send(
      JSON.stringify(msgObj)
    );
    return this.messages;
  }

  public async getMediaDevicesVideo(): Promise<MediaStream> {
    // renegotiate via webrtc itself

    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      // audio: true,
    });
    this.streams.local.video = videoStream;
    this.streams.local.video.getTracks().forEach((track) => {
      console.log("Track", track);
      this.peerConnection.addTrack(
        track,
        this.streams.local.video || videoStream
      );
    });
    return videoStream;
  }

  private _arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private _base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private _createFileMeta(files: FileList): {
    [key: string]: FilesMeta & { buffer: [] };
  } {
    const fileMetaObj: { [key: string]: FilesMeta & { buffer: [] } } = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileMeta: FilesMeta = {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        progress: { send: 0, receive: 0 },
      };
      fileMetaObj[file.name] = { ...fileMeta, buffer: [] };
    }

    return fileMetaObj;
  }

  public sendFiles(files: FileList, progressCB?: FileShareProgessFunc) {
    // prep send data about files
    const filesMeta = this._createFileMeta(files);
    this.dataChannels[this.CHANNELS.FILE_TRANSFER].send(
      JSON.stringify({ cmd: "filemeta", data: filesMeta })
    );
    this.fileTransferProtocol.filesMeta = filesMeta;

    // const file = files[0];
    for (let file of files) {
      // for now just sending the first file can send multiple files
      this._console(
        `File is ${[file.name, file.size, file.type, file.lastModified].join(
          " "
        )}`
      );

      const chunkSize = 8192;
      let offset = 0;

      const fileReader = new FileReader();

      fileReader.addEventListener("error", (error) => {
        this._console("Error reading file:", error);
        progressCB && progressCB({ error, files: {} });
      });
      fileReader.addEventListener("abort", (event) => {
        this._console("File reading aborted:", event);
        progressCB && progressCB({ error: event, files: {} });
      });

      fileReader.addEventListener("load", (e: ProgressEvent<FileReader>) => {
        this._console("FileRead.onload ", e);
        if (e.target && e.target.result instanceof ArrayBuffer) {
          let packet = {
            cmd: "filedata",
            filename: file.name,
            data: this._arrayBufferToBase64(e.target.result),
          };
          this.fileTransferProtocol.filesMeta[file.name].progress.send +=
            e.target.result.byteLength;
          progressCB &&
            progressCB({ files: this.fileTransferProtocol.filesMeta });
          // if (
          //   this.dataChannels[this.CHANNELS.FILE_TRANSFER].bufferedAmount <
          //   this.MAX_QUEUE_SIZE
          // ) {
          this.dataChannels[this.CHANNELS.FILE_TRANSFER].send(
            JSON.stringify(packet)
          );
          // }
          offset += e.target.result.byteLength;
          // sendProgress.value = offset;
          // AY Set progress here for sender
          if (offset < file.size) {
            readSlice(offset);
          }
        }
      });

      const readSlice = (offset: number) => {
        this._console("Slice Number: " + offset);
        const slice = file.slice(offset, offset + chunkSize);
        fileReader.readAsArrayBuffer(slice);
      };

      readSlice(0);
    }
  }
}
