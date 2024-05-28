//This line imports and immediately invokes the config method from the dotenv package.
// dotenv is a module that loads environment variables from a .env file into process.env.
require('dotenv').config();
require('colors');
//Set up a Node.js server using the Express framework with WebSocket support.
const express = require('express');
//ExpressWs is a library that adds WebSocket support to Express applications.
const ExpressWs = require('express-ws');

const {createClient} = require('@supabase/supabase-js');

const {GptService} = require('./services/gpt-service');
const {StreamService} = require('./services/stream-service');
const {TranscriptionService} = require('./services/transcription-service');
const {TextToSpeechService2} = require('./services/tts-11labs-service-richard');
const {TextToSpeechService3} = require('./services/tts-11labs-service-ayanna');
//By importing the VoiceResponse class, you can generate TwiML instructions for voice calls.
//TwiML (Twilio Markup Language) is a set of XML instructions that inform Twilio how to handle
// various communication events, such as incoming calls or messages.
const VoiceResponse = require('twilio').twiml.VoiceResponse;
//Module: Voice is a specific module within the Twilio SDK for handling voice calls.
const Voice = require("twilio/lib/rest/Voice");
//Prisma is an ORM that helps to interact with databases.
// It provides a powerful set of tools for working with databases, including query building,
// schema migrations, and data modeling.
//PrismaClient is the primary class provided by Prisma to interact with your database.
// It allows you to perform CRUD (Create, Read, Update, Delete) operations and run queries
// against your database using a JavaScript or TypeScript API.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
//Axios is a JavaScript library used for making HTTP requests from both the browser and Node.js
const axios = require('axios');
//Set up a Node.js server using the Express framework with WebSocket support provided by the Express-WS library.
//The express() function returns an Express application object that can be used to define routes, middleware,
// and handle HTTP requests and responses.
const app = express();
//ExpressWs is a library that adds WebSocket support to Express applications.
//It extends the Express application object to handle WebSocket connections alongside regular HTTP routes.
ExpressWs(app);
let statement = false;
//Set the port 3000 on which the server will listen
const PORT = process.env.PORT || 3000;


app.use(express.urlencoded({extended: true}));
let gptService; // Define gptService at a higher scope
let dynamicGreeting = "Welcome to our service.";
const phoneNumberMap = new Map();
let num = 0;
let richard = 0;
let ayanna = 0;

app.post('/incoming', async (req, res) => {
    const calledPhoneNumber = req.body.To;
    console.log(`Calling to number: ${calledPhoneNumber}`);

    const baseUser = {
        greetingInformation: "Hello! Thanks for calling.",
        voiceName: "voice-richard",
        Subscription: {
            maxTime: 600, // 10 minutes
            currTimeUsed: 300 // 5 minutes used
        }
    };

    // Fetch promptInformation from the database
    const users = await prisma.user.findMany({
        where: {
            id: 'kp_17aff834e67c44a3a6d069bd9eb81137'
        },
        select: {
            promptInformation: true,
        }
    });

    // Check if the user was found and update the base user object
    const fetchedUser = users[0];
    // Merge the fetched promptInformation with the baseUser
    const user = {
        ...baseUser,
        promptInformation: fetchedUser.promptInformation
    };

    // Now `user` contains both the fetched and the manually set data
    console.log(user);

    dynamicGreeting = user.greetingInformation;
    gptService = new GptService(user.promptInformation);
    console.log(user.callRecording);

    if (user.voiceName === "voice-richard") {
        richard = 1;
    } else if (user.voiceName === "voice-ayanna") {
        ayanna = 1;
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
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    let ttsService;

    if (richard === 1) {
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
            richard = 0;
            ayanna = 0
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
