// invoke an instance of SpeechRecognition, the controller interface to the Web Speech API for voice recognition
// we're including both prefixed and unprefixed versions for cross-browser compatibility
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
// optionally you can set various properties to customize the experience
// --
// including some of ECMAScript 6 features like arrow functions, and const, 
// are both available in browsers that support both Speech API interfaces SpeechRecognition and SpeechSynthesis
recognition.lang = 'en-US';
recognition.interimResults = false;
// then capture the DOM reference for the button UI and listen for the click event to initiate speech recognition
document.getElementById('speak').addEventListener('click', () => {
    recognition.start();
});
const socket = io();
socket.on('connect', () => console.log('[client] socket connected:', socket.id));

let lastTranscript = '';

// ---------- ONE good appendLine (top-level) ----------
function appendLine(text, who = 'bot') {
    const chat = document.querySelector('#chat');
    if (!chat) return;

    const p = document.createElement('p');
    p.classList.add('message', who);   // => "message user" or "message bot"
    p.textContent = text;

    chat.appendChild(p);
    requestAnimationFrame(() => {
      chat.scrollTop = chat.scrollHeight; // scroll to bottom
    });
}
// Listen for messages from the server
// once speech has started use the [result] event to retrieve what was said as text
recognition.addEventListener('result', (e) => {
    let last = e.results.length - 1;
    let text = e.results[last][0].transcript;

    lastTranscript = text;
// Note that the [results] property of the event is a 2D array

// this will return a [SpeechRecognitionResultList] object containing the result and you can retrieve the text in the array.
// also you can see in the code sample that this will return [confidence] for the transcription, too.
    console.log('Transcript: ' + text);
    console.log('Confidence: ' + e.results[0][0].confidence);
    // we will use the Socket.io to send the text to the server later
    appendLine(text, 'user'); // show my message on the right
    // insert this code where you are listening to the [result] event of the [SpeechRecognition] instance
    socket.emit('chat message', text);
});

// Listen for bot replies from the server
// ------------------------------------------------------------Bot reply handler

socket.on('bot reply', (msg) => {
    console.log('Bot says:', msg);
    playCloudTTS(msg);
    appendLine(msg, 'bot');            // left/gray
});


// CRUD operations for messages
// CREATE  (POST /api/messages)
async function createMessage(text) {
    const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Create failed');
    return res.json();
}
// READ  (GET /api/messages)
async function listMessages() {
    const res = await fetch('/api/messages');
    return res.json();
}
// READ  (GET /api/messages/:id)
async function updateMessage(id, text) {
    const res = await fetch(`/api/messages/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('Update failed');
    return res.json();
}
// DELETE  (DELETE /api/messages/:id)
async function deleteMessage(id) {
    const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    return res.json();
}

const listEl = document.getElementById('list');
const saveBtn = document.getElementById('save');

saveBtn?.addEventListener('click', async () => {
if (!lastTranscript) return alert('Speak first!');
await createMessage(lastTranscript);
renderList(await listMessages());
});

async function renderList(items) {
if (!listEl) return;
listEl.innerHTML = '';
items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `#${item.id} — ${item.text} `;

    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.onclick = async () => {
    const next = prompt('New text:', item.text);
    if (next) {
        await updateMessage(item.id, next);
        renderList(await listMessages());
        }
    };

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.onclick = async () => {
    await deleteMessage(item.id);
    renderList(await listMessages());
    };

    li.append(' ', edit, ' ', del);
    listEl.appendChild(li);
});
}

async function playCloudTTS(text) {
try {
    const r = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
    });
    const { audioContent } = await r.json();
    const audio = new Audio('data:audio/mp3;base64,' + audioContent);
    audio.play();
} catch (e) {
    console.error('TTS error:', e);
}
}

// --- type-to-bot support ---
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');

//  ------------------------------------------------------------ submit handler
form?.addEventListener('submit', (e) => {
e.preventDefault();
const text = (input?.value || '').trim();
if (!text) return;

console.log('[client] sending:', text);
// show my message on the right
appendLine(text, 'user');

// send to server
socket.emit('chat message', text);

// keep Save working
lastTranscript = text;

// clear input
if (input) { 
    input.value = '';
    input.focus();
}
});




// initial load
listMessages().then(renderList).catch(console.error);
