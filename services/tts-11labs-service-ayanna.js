//Import the EventEmitter class from the built-in Node.js events module.
//The EventEmitter class is used to create objects that can emit named events
//and handle them asynchronously.
const EventEmitter = require('events');
//Import the Buffer class from the built-in Node.js buffer module.
//The Buffer class is used to handle binary data in Node.js.
const { Buffer } = require('node:buffer');
//Import the fetch function from the node-fetch package.
//The fetch function is used to make HTTP requests in Node.js.
const fetch = require('node-fetch');

//This class converts text to speech through ElevenLabs
class TextToSpeechService3 extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    //If this.config.voiceId is undefined, null, 0, false, NaN
    //then assign this.config.voiceId to process.env.VOICE_ID_AYANNA
    this.config.voiceId ||= process.env.VOICE_ID_AYANNA;
    this.nextExpectedIndex = 0;
    this.speechBuffer = {};
  }

  async generate(gptReply, interactionCount) {
    //This line takes the values of partialResponseIndex and partialResponse from gptReply
    //and assigns them to local variables named partialResponseIndex and partialResponse.
    const { partialResponseIndex, partialResponse } = gptReply;

    //If partialResponse is falsy (i.e., null, undefined, false, 0, NaN, or an empty string),
    //then exit the function
    if (!partialResponse) { return; }

    try {

      //Set the outputFormat variable to the string 'ulaw_8000'.
      //This is the desired audio format for the text-to-speech output.
      const outputFormat = 'ulaw_8000';

      //Construct the URL for the ElevenLabs Text-to-Speech API.
      //The URL includes the voiceId from the service configuration (this.config.voiceId),
      //the desired output_format, and a parameter to optimize_streaming_latency.
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.config.voiceId}/stream?output_format=${outputFormat}&optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.XI_API_KEY, //Set the API key for authentication, retrieved from environment variables.
            'Content-Type': 'application/json', //This indicates that the request body is in JSON format.
            accept: 'audio/wav', //This specifies that the expected response format is audio/wav
          },
          // TODO: Pull more config? https://docs.elevenlabs.io/api-reference/text-to-speech-stream
          body: JSON.stringify({
            model_id: process.env.XI_MODEL_ID,
            text: partialResponse,
          }),
        }
      );
      //Await the response from the fetch call and converts it to an ArrayBuffer.
      //An ArrayBuffer is a generic, fixed-length raw binary data buffer.
      const audioArrayBuffer = await response.arrayBuffer();

      //Emit a speech event with several parameters:
      //partialResponseIndex: The index of the partial response.
      //Buffer.from(audioArrayBuffer).toString('base64'): Converts the ArrayBuffer to a Buffer and then encodes it to a base64 string.
      //partialResponse: The text that was converted to speech.
      //interactionCount: A counter for interactions, potentially used to track the number of responses or interactions.
      this.emit('speech', partialResponseIndex, Buffer.from(audioArrayBuffer).toString('base64'), partialResponse, interactionCount);
    } catch (err) {
      console.error('Error occurred in TextToSpeech service');
      console.error(err);
    }
  }
}

//By exporting TextToSpeechService3, you allow other files to import and use this class.
module.exports = { TextToSpeechService3 };