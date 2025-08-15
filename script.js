const backendUrl = "http://localhost:5000"; // Change to your backend URL

const pdfForm = document.getElementById("pdfForm");
const pdfFile = document.getElementById("pdfFile");
const uploadStatus = document.getElementById("uploadStatus");
const chatBox = document.getElementById("chatBox");
const questionForm = document.getElementById("questionForm");
const questionInput = document.getElementById("questionInput");

let pdfUploaded = false;

// Upload PDF
pdfForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = pdfFile.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("pdf", file);

  uploadStatus.textContent = "Uploading...";
  try {
    const res = await fetch(`${backendUrl}/upload`, {
      method: "POST",
      body: formData
    });
    if (res.ok) {
      pdfUploaded = true;
      uploadStatus.textContent = "✅ PDF uploaded successfully!";
    } else {
      uploadStatus.textContent = "❌ Failed to upload PDF.";
    }
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = "❌ Error uploading PDF.";
  }
});

// Ask Question
questionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!pdfUploaded) {
    alert("Please upload a PDF first!");
    return;
  }

  const question = questionInput.value.trim();
  if (!question) return;

  addMessage(question, "user");
  questionInput.value = "";

  try {
    const res = await fetch(`${backendUrl}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });
    const data = await res.json();
    addMessage(data.answer || "No answer found.", "bot");
  } catch (err) {
    console.error(err);
    addMessage("Error getting answer.", "bot");
  }
});

// Add Message to Chat
function addMessage(text, type) {
  const msg = document.createElement("div");
  msg.classList.add("message", type === "user" ? "user-message" : "bot-message");
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}
