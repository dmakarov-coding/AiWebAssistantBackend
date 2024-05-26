require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');

class GptService extends EventEmitter {
  constructor(businessDescription) {
    super();
    this.openai = new OpenAI();
    this.userContext = [
      { 'role': 'system', 'content': `IMPORTANT: You dont provide appointment bookings.
      ${businessDescription}` }
    ];
    this.partialResponseIndex = 0;
  }

  setCallSid(callSid) {
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