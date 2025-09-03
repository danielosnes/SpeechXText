require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dialogflow = require('@google-cloud/dialogflow');
const textToSpeech = require('@google-cloud/text-to-speech');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8000;
const app = express();

app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/assets'));
app.use(express.json());

// ---- choose creds source: env JSON (Render) OR default (file via GOOGLE_APPLICATION_CREDENTIALS) ----
let dfClientOpts = {};
let ttsClientOpts = {};

if (process.env.GOOGLE_CREDENTIALS) {
  try {
    const creds = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    dfClientOpts.credentials = creds;
    ttsClientOpts.credentials = creds;
  } catch (e) {
    console.error('Invalid GOOGLE_CREDENTIALS JSON:', e.message);
  }
  // (No need to set GOOGLE_APPLICATION_CREDENTIALS in this case)
} 
// else: if you set GOOGLE_APPLICATION_CREDENTIALS=<path/to/dialogflow-key.json>
// the Google SDKs will auto-load it – no code changes needed.

const sessionClient = new dialogflow.SessionsClient(dfClientOpts);
const ttsClient = new textToSpeech.TextToSpeechClient(ttsClientOpts);

// ---- your routes / socket.io / dialogflow logic below ----
const server = http.createServer(app);
const io = new Server(server);

const projectId = 'agent-smith-y9ld';

io.on('connection', (socket) => {
  const sessionId = uuidv4();
  console.log('[server] client connected', socket.id);

  socket.on('chat message', async (text) => {
    try {
      const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);
      const request = {
        session: sessionPath,
        queryInput: { text: { text, languageCode: 'en-US' } }
      };
      const [response] = await sessionClient.detectIntent(request);
      const botReply = response.queryResult?.fulfillmentText || '(no reply)';
      socket.emit('bot reply', botReply);
    } catch (err) {
      console.error('Dialogflow error:', err.message);
      socket.emit('bot reply', 'Sorry, I had trouble understanding that.');
    }
  });
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    const [resp] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    res.json({ audioContent: resp.audioContent.toString('base64') });
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
