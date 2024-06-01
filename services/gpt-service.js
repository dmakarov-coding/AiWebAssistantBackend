//This module is used to add color to the console output, making it easier to read debug and log messages.
require('colors');
//This imports the EventEmitter class from Node.js, which allows the GptService class to emit
// and listen for events.
const EventEmitter = require('events');
//This imports the OpenAI class, which will be used to interact with the OpenAI API.
const OpenAI = require('openai');

class GptService extends EventEmitter {
  //This is the constructor method for the GptService class, which initializes an instance of the class.
  constructor(businessDescription) {
    super();
    //Create an instance of the OpenAI class and assign it to the openai property of the GptService instance.
    this.openai = new OpenAI();
    //Initializes the userContext property, which is an array containing a single object.
    //This object defines the role and initial context for the conversation with the OpenAI API.
    //The context specifies that appointment bookings are not provided and includes the provided businessDescription.
    //This is important for setting the initial behavior and scope of the AI's responses.
    this.userContext = [
      { 'role': 'system', 'content': `${businessDescription}` }
    ];

    this.partialResponseIndex = 0;
  }

  setCallSid(callSid) {
    //This line adds a new object to the userContext array. The object has two properties:
    //'role': 'system': This specifies that the role of this message is system,
    //indicating that it is a system-level message and not from a user or assistant.
    //'content': callSid: ${callSid}``: This sets the content of the message to include the callSid.
    //By embedding the callSid in the context, it ensures that this identifier is included
    //in the context for subsequent interactions with the OpenAI API, which
    //is useful for tracking the conversation or for any logic dependent on the callSid.
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  async completion(text, interactionCount, role = 'user', name = 'user') {
    if (name != 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }

    const stream = await this.openai.chat.completions.create({
      // ft:gpt-3.5-turbo-0125:aireception::9JkGmPmL
      // gpt-4-turbo
      model: 'gpt-4-turbo',
      messages: this.userContext,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let finishReason = chunk.choices[0].finish_reason;

      completeResponse += content;
      partialResponse += content;

      if (content.trim().slice(-1) === '.' || content.trim().slice(-1) === '?' || content.trim().slice(-1) === '!' || finishReason === 'stop') {
        let sentences = partialResponse.split('.');
        sentences.forEach((sentence) => {
          if (sentence.trim() !== '') {
            const gptReply = {
              partialResponseIndex: this.partialResponseIndex,
              partialResponse: sentence.trim()
            };

            this.emit('gptreply', gptReply, interactionCount);
            this.partialResponseIndex++;
          }
        });
        partialResponse = '';
      }
    }
    this.userContext.push({'role': 'assistant', 'content': completeResponse});
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };