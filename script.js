const backendUrl = 'https://pdf-qa-live.onrender.com'; // Change for deployment

const pdfForm = document.getElementById('pdfForm');
const pdfFile = document.getElementById('pdfFile');
const uploadStatus = document.getElementById('uploadStatus');
const chatBox = document.getElementById('chatBox');
const questionForm = document.getElementById('questionForm');
const questionInput = document.getElementById('questionInput');

let pdfUploaded = false;

// Upload PDF
pdfForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = pdfFile.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('pdf', file);

  // Show "uploading" status
  // uploadStatus.innerHTML = `
  // <div class="alert alert-warning">
  //   <span class="spinner-border spinner-border-sm"></span>
  //   Uploading & processing PDF... This may take up to 30 seconds
  // </div>`;

  // After upload success:
  uploadStatus.innerHTML = `<div class="alert alert-info">Processing PDF...</div>`;
  const checkInterval = setInterval(async () => {
    const res = await fetch(`${backendUrl}/status`);
    const data = await res.json();
    if (data.status === "done") {
      clearInterval(checkInterval);
    uploadStatus.innerHTML = `<div class="alert alert-success">✅ Ready to take questions!</div>`;
  }
}, 2000);


  try {
    const res = await fetch(`${backendUrl}/upload`, {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      pdfUploaded = true;
      uploadStatus.innerHTML = `<div class="alert alert-success">✅ PDF uploaded & stored! You can now ask questions.</div>`;
    } else {
      uploadStatus.innerHTML = `<div class="alert alert-danger">❌ Failed to upload PDF.</div>`;
    }
  } catch (err) {
    console.error(err);
    uploadStatus.innerHTML = `<div class="alert alert-danger">❌ Error uploading PDF.</div>`;
  }
});

// Ask Question
questionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pdfUploaded) {
    alert('⚠️ Please upload a PDF first!');
    return;
  }

  const question = questionInput.value.trim();
  if (!question) return;

  addMessage(question, 'user');
  questionInput.value = '';

  // Show "thinking" message
  addMessage('🤔 Thinking...', 'bot');

  try {
    const res = await fetch(`${backendUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    const data = await res.json();

    // Remove the "thinking" message
    removeLastBotMessage();

    // Show answer
    addMessage(data.answer || 'No answer found.', 'bot');
  } catch (err) {
    console.error(err);
    removeLastBotMessage();
    addMessage('❌ Error getting answer.', 'bot');
  }
});

// Add Message to Chat
function addMessage(text, type) {
  const msg = document.createElement('div');
  msg.classList.add('message', type === 'user' ? 'user-message' : 'bot-message');
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Remove last bot message (for removing "thinking" text)
function removeLastBotMessage() {
  const messages = chatBox.querySelectorAll('.bot-message');
  if (messages.length > 0) {
    messages[messages.length - 1].remove();
  }
}

// 🌙 Theme Toggle
const themeToggle = document.getElementById('themeToggle');
const currentTheme = localStorage.getItem('theme');

if (currentTheme === 'dark') {
  document.body.classList.add('dark-mode');
  themeToggle.textContent = "☀️ Light Mode";
}

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');

  if (document.body.classList.contains('dark-mode')) {
    localStorage.setItem('theme', 'dark');
    themeToggle.textContent = "☀️ Light Mode";
  } else {
    localStorage.setItem('theme', 'light');
    themeToggle.textContent = "🌙 Dark Mode";
  }
});
