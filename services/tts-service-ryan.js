require("dotenv").config();
const EventEmitter = require('events');
const { Buffer } = require('node:buffer');
const { spawn } = require('child_process');
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class TextToSpeechService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    const { partialResponseIndex, partialResponse } = gptReply;

    if (!partialResponse) { return; }

    try {
      console.log("Speech synthesis initializing.");
      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: partialResponse,
      });

      const audioArrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(audioArrayBuffer);

      this.convertAudio(audioBuffer, partialResponseIndex, partialResponse, interactionCount);
    } catch (err) {
      console.error('Error occurred in TextToSpeech service:', err);
    }
  }

  convertAudio(buffer, partialResponseIndex, partialResponse, interactionCount) {
    const ffmpegProcess = spawn('ffmpeg', [
      '-i', 'pipe:0',                       // Input from stdin
      '-ar', '8000',                        // Set audio sample rate to 8000 Hz
      '-acodec', 'pcm_mulaw',               // Set audio codec to μ-law
      '-f', 'u8',                           // Output format as unsigned 8-bit PCM
      'pipe:1'                              // Output to stdout
    ]);

    let audioChunks = [];

    ffmpegProcess.stdout.on('data', (chunk) => {
      audioChunks.push(chunk);
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`ffmpeg exited with code ${code}`);
        return;
      }
      const audioOutput = Buffer.concat(audioChunks);
      const audioBase64 = audioOutput.toString('base64');
      this.emit('speech', partialResponseIndex, audioBase64, partialResponse, interactionCount);
      console.log("Audio conversion complete.");
    });

    ffmpegProcess.stdin.write(buffer);
    ffmpegProcess.stdin.end();
  }
}

module.exports = { TextToSpeechService };