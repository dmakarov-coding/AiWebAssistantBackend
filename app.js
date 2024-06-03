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
//various communication events, such as incoming calls or messages.
const VoiceResponse = require('twilio').twiml.VoiceResponse;
//Module: Voice is a specific module within the Twilio SDK for handling voice calls.
const Voice = require("twilio/lib/rest/Voice");
//Prisma is an ORM that helps to interact with databases.
//It provides a powerful set of tools for working with databases, including query building,
//schema migrations, and data modeling.
//PrismaClient is the primary class provided by Prisma to interact with your database.
//It allows you to perform CRUD (Create, Read, Update, Delete) operations and run queries
//against your database using a JavaScript or TypeScript API.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
//Axios is a JavaScript library used for making HTTP requests from both the browser and Node.js
const axios = require('axios');
//Set up a Node.js server using the Express framework with WebSocket support provided
//by the Express-WS library.
//The express() function returns an Express application object that can be used to define routes,
// middleware, and handle HTTP requests and responses.
const app = express();
//ExpressWs is a library that adds WebSocket support to Express applications.
//It extends the Express application object to handle WebSocket connections alongside regular HTTP routes.
ExpressWs(app);
let statement = false;
//Set the port 3000 on which the server will listen
const PORT = process.env.PORT || 3000;
//This line adds middleware to the Express application to parse URL-encoded data from incoming HTTP requests.
//It enables the application to parse form data submitted via POST requests.
//The express.urlencoded() middleware parses incoming request bodies and makes the parsed data available
//in req.body. Setting {extended: true} allows the parsing of nested objects in the URL-encoded data.
app.use(express.urlencoded({extended: true}));
let gptService; // Define gptService at a higher scope
let dynamicGreeting = "Welcome to our service.";
const phoneNumberMap = new Map();
let num = 0;
let richard = 0;
let ayanna = 0;

//This line defines a POST route with the path '/incoming'.
//When an HTTP POST request is made to the '/incoming' endpoint,
//the callback function specified in the second argument is executed.
//The callback function receives two parameters: req (the request object) and res (the response object).
app.post('/incoming', async (req, res) => {

    //This line retrieves the phone number that the incoming call is directed to.
    //It extracts the value of the 'To' property from the body of the incoming request.
    const calledPhoneNumber = req.body.To;

    //Log the phone number being called to the console.
    console.log(`Calling to number: ${calledPhoneNumber}`);

    //Define baseUser odject that contains a string with a greeting message and voice name to be used
    const baseUser = {
        greetingInformation: "Hello! Thanks for calling.",
        voiceName: "voice-richard"
    };

    //This code uses Prisma, an ORM (Object-Relational Mapping) tool, to fetch data from the database.
    //It fetches prompt information (promptInformation field) from the database
    const users = await prisma.user.findMany({
        where: {
            id: 'kp_17aff834e67c44a3a6d069bd9eb81137'
        },
        select: {
            promptInformation: true,
        }
    });

    //Check if the user was found and update the base user object
    const fetchedUser = users[0];

    //Merge the fetched promptInformation with the baseUser
    //A new user object is created using the spread operator (...)
    //to merge the baseUser object with the promptInformation from fetchedUser.
    const user = {
        ...baseUser,
        promptInformation: fetchedUser.promptInformation
    };

    //Now `user` contains both the fetched and the manually set data
    //This line logs the final user object to the console
    console.log(user);

    //Get greeting and save it into dynamicGreeting variable
    dynamicGreeting = user.greetingInformation;

    //Create a new instance of the GptService class and store it in the variable gptService.
    //Pass user.promptInformation to the GptService constructor.
    //This user.promptInformation is business description.
    gptService = new GptService(user.promptInformation);

    //console.log(user.callRecording);

    //Check wchich voice to use.
    if (user.voiceName === "voice-richard") {
        richard = 1;
    } else if (user.voiceName === "voice-ayanna") {
        ayanna = 1;
    }

    //This sets the HTTP status code of the response to 200, indicating a successful request.
    res.status(200);

    //This sets the Content-Type of the response to 'text/xml',
    //indicating that the response body will contain XML data.
    res.type('text/xml');

    //This sends an XML response to the client.
    //The url attribute of the<Stream>element specifies the WebSocket URL to connect to,
    //which is constructed using the value of theSERVER` environment variable.
    //It redirects user to /connection URL
    res.end(`
    <Response>
        <Connect>
            <Stream url="wss://${process.env.SERVER}/connection" />
        </Connect>
    </Response>
    `);
});


//Define a WebSocket route at the path /connection.
//When a WebSocket connection is established to this path,
//the provided callback function is executed.
//The function receives a WebSocket object (ws) as an argument,
//which is used to interact with the WebSocket connection
app.ws('/connection', async (ws) => {

    //Listen for errors that occur on the WebSocket connection.
    // If an error occurs, it's logged to the console using console.error.
    ws.on('error', console.error);

    // Filled in from start message
    let streamSid;
    let callSid;
    let persons_phone_number;
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    let ttsService;

    //Convert text to speech either through ElevenLabs
    if (richard === 1) {
        ttsService = new TextToSpeechService2({});
    } else if (ayanna === 1) {
        ttsService = new TextToSpeechService3({});
    }

    //Create array of marks
    let marks = [];

    //Create couter
    let interactionCount = 0;

    //Incoming from MediaStream
    //Set up an event listener for the WebSocket connection.
    //Whenever a message is received, the callback function message is executed.
    ws.on('message', async function message(data) {

        //This line parses the received message data assuming it's in JSON format
        //and assigns it to the variable msg.
        const msg = JSON.parse(data);

        //The code checks the event property of the received message (msg.event) to determine
        //the type of message and executes different actions accordingly
        //The code executes the corresponding handling logic for the start event.
        if (msg.event === 'start') {

            //Assign the value of streamSid from the msg.start object to the variable streamSid.
            streamSid = msg.start.streamSid;

            //Assign the value of callSid from the msg.start object to the variable callSid.
            callSid = msg.start.callSid;

            //Retrieve persons_phone_number from phoneNumberMap
            persons_phone_number = phoneNumberMap.get(callSid);

            //Log a message indicating that a WebSocket connection has been established
            //for the phone number
            //stored in persons_phone_number
            console.log(`WebSocket connection for ${persons_phone_number}`);

            //Call the setStreamSid method of the streamService object, passing streamSid as an argument.
            streamService.setStreamSid(streamSid);

            //Call the setCallSid method of the gptService object, passing callSid as an argument.
            gptService.setCallSid(callSid);

            //Log a message indicating the start of the media stream processing.
            console.log("Start")


            console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);

            //Convert text to speech through  ElevenLabs
            //This generates a greeting message to the user.
            ttsService.generate({partialResponseIndex: null, partialResponse: dynamicGreeting}, 1);
        } else if (msg.event === 'media') {
            //Convert audio file to text through Deepgram
            //Send the media data payload received from the client to a transcription
            //service for processing.
            //To convert media file to text, we use Deepgram.
            transcriptionService.send(msg.media.payload);
        } else if (msg.event === 'mark') {
            //The code below logs a message indicating that an audio mark has been completed,
            //and then filters out the mark from an array named marks.
            const label = msg.mark.name;
            console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
            marks = marks.filter(m => m !== msg.mark.name);
        } else if (msg.event === 'stop') {
            //Log a message indicating that the media stream has ended
            console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
            richard = 0;
            ayanna = 0

            //This line removes an entry from the phoneNumberMap map data structure using the callSid as the key.
            //Clear phoneNumberMap: delete user record.
            phoneNumberMap.delete(callSid);

            //This line logs the updated phoneNumberMap to the console.
            console.log(phoneNumberMap);

            //This line closes the WebSocket connection represented by the ws object.
            ws.close();
        }
    });

    //This line sets up an event listener for the 'utterance' event emitted by the transcriptionService object.
    //This code used for detecting interuptions.
    transcriptionService.on('utterance', async (text) => {

        //This is a bit of a hack to filter out empty utterances
        //This conditional statement checks if there are any items in the marks array
        //and if the text variable is not empty and has a length greater than 5.
        if (marks.length > 0 && text?.length > 5) {
            console.log('Twilio -> Interruption, Clearing stream'.red);

            //This line sends a WebSocket message to the client represented by the ws object.
            //The message is a JSON stringified object containing the streamSid and an event 'clear'.
            //It informs the client to clear the stream associated with the provided streamSid.
            ws.send(
                JSON.stringify({
                    streamSid,
                    event: 'clear',
                })
            );
        }
    });

    //This line sets up an event listener for the 'transcription' event emitted
    //by the transcriptionService object.
    //We send information to Chat-GPT.
    transcriptionService.on('transcription', async (text) => {

        //This conditional statement checks if the text variable is falsy (i.e., null, undefined, 0, false, '', NaN).
        //If text is falsy, the function returns early, preventing further execution of the code.
        if (!text) {
            return;
        }

        //This line logs a message indicating an interaction between the Speech-to-Text (STT)
        //system and the GPT (Generative Pre-trained Transformer) model.
        //${interactionCount} is a placeholder for the current value of the interactionCount variable.
        //${text} represents the transcribed text received from the STT system.
        //.yellow applies yellow color to the logged message
        console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);

        //This line invokes a method named completion of the gptService object,
        //passing the transcribed text and the current interactionCount as arguments.
        //We send information to Chat-GPT.
        gptService.completion(text, interactionCount);

        interactionCount += 1;
    });

    //This line sets up an event listener for the 'gptreply' event emitted by the gptService object.
    //We get a response from Chat-GPT
    gptService.on('gptreply', async (gptReply, icount) => {
        console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green);

        //Convert Chat-GPT text response to audio
        ttsService.generate(gptReply, icount);
    });

    //This line sets up an event listener for the 'speech' event emitted by the ttsService object.
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
        console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);

        //Buffer audio and send audio to user
        streamService.buffer(responseIndex, audio);
    });

    //This line sets up an event listener for the 'audiosent' event emitted by the streamService object.
    streamService.on('audiosent', (markLabel) => {

        //This line adds the markLabel to the marks array.
        //marks store labels associated with audio segments sent to the TWILIO service.
        marks.push(markLabel);
    });
});

//Listen port 3000
app.listen(PORT);

//This line logs a message that application is running on port 3000
console.log(`Server running on port ${PORT}`);