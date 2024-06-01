require('colors');
const { Deepgram } = require('@deepgram/sdk');
const { Buffer } = require('node:buffer');
// Import the EventEmitter class from the built-in Node.js events module.
// The EventEmitter class is used to create objects that can emit named events and handle them asynchronously.
const EventEmitter = require('events');

//This class converts audio file into text by Deepgram
//THis class extends the EventEmitter class from the events module.
//This allows instances of TranscriptionService to emit events and listen for them.
class TranscriptionService extends EventEmitter {
  constructor() {
    super();
    //An instance of the Deepgram SDK is created using the provided Deepgram API key (process.env.DEEPGRAM_API_KEY).
    //This key is stored in environment variables for security (env file).
    const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

    //This method is called to set up live transcription settings.
    //These settings configure how Deepgram will transcribe live audio streams.
    //Parameters such as encoding, sample rate, model, punctuate (adding punctuation),
    //interim results (showing results as they are received), endpointing (detecting speech endpoint),
    //and utterance_end_ms (maximum duration of an utterance) are specified.
    this.deepgramLive = deepgram.transcription.live({
      encoding: 'mulaw',
      sample_rate: '8000',
      model: 'nova-2',
      punctuate: true,
      interim_results: true,
      endpointing: 200,
      utterance_end_ms: 1000
    });

    this.finalResult = '';
    this.speechFinal = false; //It is used to determine if we have seen speech_final=true indicating that deepgram detected a natural pause in the speakers speech.

    //This line sets up an event listener for the 'transcriptReceived' event emitted by the deepgramLive object.
    //When Deepgram sends a transcription message, this callback function is invoked.
    this.deepgramLive.addListener('transcriptReceived', (transcriptionMessage) => {
      //The transcriptionMessage received from Deepgram is parsed into a JSON object named transcription.
      const transcription = JSON.parse(transcriptionMessage);
      //The alternatives variable is assigned the value of transcription.channel.alternatives, if it exists.
      //This structure contains different transcriptions or variations of the speech.
      const alternatives = transcription.channel?.alternatives;
      let text = '';
      if (alternatives) {
        //If alternatives exist, assign the first transcript in the array to the text variable.
        //The ?. operator is used to safely access properties, ensuring no error occurs
        //if alternatives[0] is null or undefined.
        text = alternatives[0]?.transcript;
      }
      
      //If we receive an UtteranceEnd and speech_final has not already happened
      //then we should consider this the end of of the human speech and emit the transcription
      if (transcription.type === 'UtteranceEnd') {
        if (!this.speechFinal) {
          console.log(`UtteranceEnd received before speechFinal, emit the text collected so far: ${this.finalResult}`.yellow);
          this.emit('transcription', this.finalResult);
          return;
        } else {
          console.log('STT -> Speech was already final when UtteranceEnd recevied'.yellow);
          return;
        }
      }

      //If is_final that means that this chunk of the transcription is accurate and we need
      //to add it to the finalResult
      //The condition below checks if the transcription is marked as final.
      //If true, it means the current chunk of transcription is considered complete and accurate.
      if (transcription.is_final === true && text.trim().length > 0) {
        //If both conditions are met, it means the transcription is accurate and non-empty,
        //so it should be added to the finalResult.
        this.finalResult += ` ${text}`;
        //If speech_final and is_final that means this text is accurate and it's a natural pause
        //in the speakers speech. We need to send this to the assistant for processing
        if (transcription.speech_final === true) {
          this.speechFinal = true; // this will prevent a utterance end which shows up after speechFinal from sending another response
          this.emit('transcription', this.finalResult);
          this.finalResult = '';
        } else {
          //if we receive a message without speechFinal reset speechFinal to false,
          //this will allow any subsequent utteranceEnd messages to properly indicate the end of a message
          this.speechFinal = false;
        }
      } else {
        this.emit('utterance', text);
      }
    });

    //This event is emitted when an error occurs during the transcription process.
    //The callback function (error) => {...} is executed whenever this event occurs.
    //Inside the callback, the error is logged to the console using console.error.
    this.deepgramLive.addListener('error', (error) => {
      console.error('STT -> deepgram error');
      console.error(error);
    });

    //This event is emitted when there is a warning or non-fatal issue during transcription.
    //Similar to the error event, the callback function (warning) => {...} is executed whenever this event occurs,
    //and the warning is logged to the console.
    this.deepgramLive.addListener('warning', (warning) => {
      console.error('STT -> deepgram warning');
      console.error(warning);
    });

    //This event is emitted when metadata related to the transcription is available.
    //The callback function (metadata) => {...} is executed whenever this event occurs,
    //and the metadata is logged to the console.
    this.deepgramLive.addListener('metadata', (metadata) => {
      console.error('STT -> deepgram metadata');
      console.error(metadata);
    });

    //This event is emitted when the connection to Deepgram's transcription service is closed.
    // The callback function () => {...} is executed whenever this event occurs,
    // and a message indicating the closure of the connection is logged to the console using console.log.
    this.deepgramLive.addListener('close', () => {
      console.log('STT -> Deepgram connection closed'.yellow);
    });
  }

  /**
   * Send the payload to Deepgram for transcription
   * @param {String} payload A base64 MULAW/8000 audio stream
   */
  send(payload) {
    // TODO: Buffer up the media and then send
    //This condition checks if the WebSocket connection to Deepgram (this.deepgramLive) is in the OPEN state.
    if (this.deepgramLive.getReadyState() === 1) {
      //Buffer.from(payload, 'base64') is used to decode the base64 encoded payload into a binary buffer
      //before sending it via the WebSocket connection.
      this.deepgramLive.send(Buffer.from(payload, 'base64'));
    }
  }
}
//By exporting TranscriptionService, you allow other files to import and use this class.
module.exports = { TranscriptionService };