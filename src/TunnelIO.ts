export type ChannelEventsType = {
  onmessage: (e: MessageEvent<any>, channel: string) => void;
  onopen: (e: Event, channel: string) => void;
  onclose: (e: Event, channel: string) => void;
};

export type CBsType = {
  onicecandidate: (sdp: RTCSessionDescription | null) => void;
  channelEvents: ChannelEventsType;
};

export type TunnelIOArgs = {
  isInitiator?: boolean;
  logLevel?: "DEBUG" | "PROD";
};

export type TunnelHookArgs = {
  cbs?: CBsType;
};

export class TunnelIO {
  public DEFAULT_CHANNEL = "DEFAULT_CHANNEL";
  public LOG_LEVEL: "DEBUG" | "PROD" = "DEBUG";
  private isInitiator: boolean = true;
  public peerConnection: RTCPeerConnection;
  public dataChannels: { [key: string]: RTCDataChannel } = {};
  private messages: string[] = [];

  constructor(args: TunnelIOArgs & TunnelHookArgs) {
    const { isInitiator, logLevel, cbs } = args;
    const { onicecandidate, channelEvents } = cbs || {};

    this.LOG_LEVEL = logLevel || this.LOG_LEVEL;
    this.isInitiator = isInitiator || false;
    this.peerConnection = new RTCPeerConnection();
    this.peerConnection.onicecandidate = (e) => {
      this._console("new ice-candidates");
      this._console(JSON.stringify(this.peerConnection.localDescription));
      onicecandidate && onicecandidate(this.peerConnection.localDescription);
    };

    if (this.isInitiator) {
      this.dataChannels[this.DEFAULT_CHANNEL] =
        this.peerConnection.createDataChannel(this.DEFAULT_CHANNEL);
      this._bindChannelEvents(this.DEFAULT_CHANNEL, channelEvents);

      // creating SDP
      this.peerConnection
        .createOffer()
        .then((o) => this.peerConnection.setLocalDescription(o));
    } else {
      this.peerConnection.ondatachannel = (e) => {
        this.dataChannels[this.DEFAULT_CHANNEL] = e.channel;
        this._bindChannelEvents(this.DEFAULT_CHANNEL, channelEvents);
      };
    }
  }

  private _bindChannelEvents(
    channel: string,
    channelEvents?: ChannelEventsType
  ) {
    this.dataChannels[channel].onmessage = (e) => {
      this.messages.push(e.data);
      this._console(`message [${channel}] : ${e.data}`);
      channelEvents?.onmessage(e, channel);
    };
    this.dataChannels[channel].onopen = (e) => {
      this._console(`channel-open : ${channel}`);
      channelEvents?.onopen(e, channel);
    };
    this.dataChannels[channel].onclose = (e) => {
      this._console(`channel-close : ${channel}`);
      channelEvents?.onclose(e, channel);
    };
  }

  private _console(data: any) {
    switch (this.LOG_LEVEL) {
      case "DEBUG":
        console.log(data);
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

  public sendMessage(msg: string, channel?: string) {
    if (channel && !this.dataChannels[channel]) {
      console.error(`No such channel created : ${channel}`);
      return;
    }
    this.dataChannels[channel || this.DEFAULT_CHANNEL].send(msg);
  }
}
