class AgentKanbanVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1024);
    this.offset = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const frames = channels[0].length;
    for (let frame = 0; frame < frames; frame += 1) {
      let value = 0;
      for (let channel = 0; channel < channels.length; channel += 1) {
        value += channels[channel][frame] || 0;
      }
      this.buffer[this.offset] = value / channels.length;
      this.offset += 1;
      if (this.offset === this.buffer.length) {
        const samples = this.buffer;
        this.port.postMessage({ samples }, [samples.buffer]);
        this.buffer = new Float32Array(1024);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('agent-kanban-voice-capture', AgentKanbanVoiceCapture);
