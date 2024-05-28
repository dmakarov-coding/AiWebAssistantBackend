require('dotenv').config();
require('colors');
const express = require('express');
const ExpressWs = require('express-ws');


const {createClient} = require('@supabase/supabase-js');

const {GptService} = require('./services/gpt-service');
const {StreamService} = require('./services/stream-service');
const {TranscriptionService} = require('./services/transcription-service');
const {TextToSpeechService} = require('./services/tts-service-ryan');
const {TextToSpeechService2} = require('./services/tts-11labs-service-richard');
const {TextToSpeechService3} = require('./services/tts-11labs-service-ayanna');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const Voice = require("twilio/lib/rest/Voice");
const axios = require('axios');


const app = express();
ExpressWs(app);
let statement = false;
const PORT = process.env.PORT || 3000;

// app.post('/voice', (request, response) => {
//   // Get information about the incoming call, like the city associated
//   // with the phone number (if Twilio can discover it)
//   const city = request.body.FromCity;
//   console.log(`Calling to number: ${city}`);
// });

app.use(express.urlencoded({extended: true}));
let gptService; // Define gptService at a higher scope
let dynamicGreeting = "Welcome to our service.";
let remainingTime; // Declare this at the top level for wider scope
const phoneNumberMap = new Map();
let num = 0;
let recordCall = false;

let ryan = 0;
let richard = 0;
let ayanna = 0;

app.post('/incoming', async (req, res) => {
    const calledPhoneNumber = req.body.To;
    console.log(`Calling to number: ${calledPhoneNumber}`);

    // Hardcoded user data
    const user = {
        greetingInformation: "Hello! Thanks for calling.",
        promptInformation: "How can I assist you today?",
        callRecording: true,
        voiceName: "voice-richard",
        Subscription: {
            maxTime: 600, // 10 minutes
            currTimeUsed: 300 // 5 minutes used
        }
    };

    dynamicGreeting = user.greetingInformation;
    gptService = new GptService(user.promptInformation);
    console.log(user.callRecording);

    if (user.voiceName === "voice-ryan") {
        ryan = 1;
    } else if (user.voiceName === "voice-richard") {
        richard = 1;
    } else if (user.voiceName === "voice-ayanna") {
        ayanna = 1;
    }

    if (user.callRecording) {
        recordCall = true;
    }

    // Check if the current time used is greater than or equal to max time allowed
    if (user.Subscription.currTimeUsed >= user.Subscription.maxTime) {
        console.log("Current time used exceeds or equals the maximum time allowed. Ending call.");
        const voiceResponse = new VoiceResponse();
        voiceResponse.say("Your maximum allowed time has been reached. Please upgrade your plan or wait until renewed.");
        voiceResponse.hangup();  // Optionally add a hangup command
        res.type('text/xml');
        res.send(voiceResponse.toString());
        return;
    } else {
        remainingTime = user.Subscription.maxTime - user.Subscription.currTimeUsed;
        console.log(remainingTime);
    }

    res.status(200);
    res.type('text/xml');
    res.end(`
    <Response>
        <Connect>
            <Stream url="wss://${process.env.SERVER}/connection" />
        </Connect>
    </Response>
    `);
});



app.ws('/connection', async (ws) => {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;
    let persons_phone_number;
    let callStartTime;
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    let ttsService;

    if (ryan === 1) {
        ttsService = new TextToSpeechService({});
    } else if (richard === 1) {
        ttsService = new TextToSpeechService2({});
    } else if (ayanna === 1) {
        ttsService = new TextToSpeechService3({});
    }
    // const ttsService = new TextToSpeechService({});

    let marks = [];
    let interactionCount = 0;

    // Incoming from MediaStream
    ws.on('message', async function message(data) {
        const msg = JSON.parse(data);

        if (msg.event === 'start') {
            streamSid = msg.start.streamSid;
            callSid = msg.start.callSid;
            persons_phone_number = phoneNumberMap.get(callSid);
            console.log(`WebSocket connection for ${persons_phone_number}`);
            streamService.setStreamSid(streamSid);
            gptService.setCallSid(callSid);
            callStartTime = new Date(); // Record the start time of the call
            console.log("Start")
            console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
            //Convert text to speech through  ElevenLabs or Open_AI
            ttsService.generate({partialResponseIndex: null, partialResponse: dynamicGreeting}, 1);
        } else if (msg.event === 'media') {
            //Convert audio file to test through Deepgram
            transcriptionService.send(msg.media.payload);
        } else if (msg.event === 'mark') {
            const label = msg.mark.name;
            console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
            marks = marks.filter(m => m !== msg.mark.name);
        } else if (msg.event === 'stop') {
            console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
            const callEndTime = new Date();
            const callDuration = (callEndTime - callStartTime) / 1000;
            const roundedDuration = Math.round(callDuration);
            console.log(`Call ended at: ${callEndTime.toLocaleTimeString()} - Duration: ${roundedDuration} seconds`);
            console.log(persons_phone_number);
            ryan = 0;
            richard = 0;
            ayanna = 0
            recordCall = false;


            phoneNumberMap.delete(callSid);
            console.log(phoneNumberMap);
            ws.close(); // Close WebSocket connection
        }
    });


    transcriptionService.on('utterance', async (text) => {
        // This is a bit of a hack to filter out empty utterances
        if (marks.length > 0 && text?.length > 5) {
            console.log('Twilio -> Interruption, Clearing stream'.red);
            ws.send(
                JSON.stringify({
                    streamSid,
                    event: 'clear',
                })
            );
        }
    });

    transcriptionService.on('transcription', async (text) => {
        if (!text) {
            return;
        }
        console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
        gptService.completion(text, interactionCount);
        interactionCount += 1;
    });

    gptService.on('gptreply', async (gptReply, icount) => {
        console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);
        ttsService.generate(gptReply, icount);
    });

    ttsService.on('speech', (responseIndex, audio, label, icount) => {
        console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);

        streamService.buffer(responseIndex, audio);
    });

    streamService.on('audiosent', (markLabel) => {
        marks.push(markLabel);
    });
});

app.listen(PORT);
console.log(`Server running on port ${PORT}`);
