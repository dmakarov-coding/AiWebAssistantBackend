//Importing the EventEmitter class from the 'events' module in Node.js.
//This class is used to create objects that can emit named events and handle them asynchronously.
const EventEmitter = require('events');
//Importing the 'uuid' module to generate universally unique identifiers (UUIDs).
const uuid = require('uuid');

class StreamService extends EventEmitter {
  constructor(websocket) {
    super();
    this.ws = websocket;
    this.expectedAudioIndex = 0;
    this.audioBuffer = {};
    this.streamSid = '';
    this.callSid = '';
  }

  setStreamSid (streamSid) {
    this.streamSid = streamSid;
  }


  //Buffers incoming audio chunks based on their index.
  //If the index matches the expected index, it sends the audio chunk.
  //If not, it buffers the audio chunk.
  buffer (index, audio) {

    // Escape hatch for intro message, which doesn't have an index
    if(index === null) {

      //Send audio data over the WebSocket connection.
      //It sends the audio payload, generates a unique mark label for the audio segment,
      //sends a 'mark' event message with the label, and emits an 'audiosent' event with the mark label.
      //This condition checks if the index parameter is null.
      //This is used as an escape hatch for an intro message, which doesn't have an index.
      //If the index is null, it immediately sends the audio through sendAudio().
      this.sendAudio(audio);
    } else if(index === this.expectedAudioIndex) {

      //This condition checks if the index matches the expectedAudioIndex.
      //If it does, it means that this is the next expected audio chunk in sequence.
      //It sends the audio through sendAudio(), increments expectedAudioIndex,
      //and then checks if there are any buffered audio chunks that follow immediately.
      //If there are, it sends them as well, updating expectedAudioIndex accordingly.
      this.sendAudio(audio);
      this.expectedAudioIndex++;

      //This line initiates a while loop that continues as long as there is a buffered audio chunk
      //with an index matching the current expectedAudioIndex.
      //It checks if the audioBuffer object has a property corresponding to the expectedAudioIndex.
      while(Object.prototype.hasOwnProperty.call(this.audioBuffer, this.expectedAudioIndex)) {
        const bufferedAudio = this.audioBuffer[this.expectedAudioIndex];
        this.sendAudio(bufferedAudio);
        this.expectedAudioIndex++;
      }
    } else {
      this.audioBuffer[index] = audio;
    }
  }

  sendAudio (audio) {

    //This line sends data over the WebSocket connection. The ws object represents the WebSocket connection.
    this.ws.send(

      //It converts the JavaScript object into a JSON string.
      //The data being sent must be in string format when sent over the WebSocket.
      JSON.stringify({
        streamSid: this.streamSid,
        event: 'media', //specifies the type of event being sent.
        media: {
          //This is the actual audio data being sent.
          //It's encapsulated within a media object, with the audio payload contained within the payload property.
          payload: audio,
        },
      })
    );
    // When the media completes you will receive a `mark` message with the label
    //It generates a unique identifier using version 4 of the UUID (Universally Unique Identifier) specification.
    //This unique identifier is stored in the variable markLabel.
    const markLabel = uuid.v4();
    //Send data over the WebSocket connection. The ws object represents the WebSocket connection.
    this.ws.send(

      //Convert the JavaScript object into a JSON string.
      //The data being sent must be in string format when sent over the WebSocket.
      JSON.stringify({
        //This line of code specifies the unique identifier for the media stream.
        //It's included in the payload to identify the stream to which the mark event belongs.
        streamSid: this.streamSid,
        //It indicates the type of event being sent.
        //In this case, it's a "mark" event, which represents a specific point or label in the media stream.
        event: 'mark',
        mark: {
          //It contains the mark label generated earlier.
          //It's encapsulated within a mark object, with the label stored in the name property.
          name: markLabel
        }
      })
    );
    this.emit('audiosent', markLabel);
  }
}

//By exporting StreamService, you allow other files to import and use this class.
module.exports = {StreamService};