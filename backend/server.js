//indexDocument() from index.js → moved into /upload endpoint
//chatting() from query.js → moved into /ask endpoint
// both backend file is merged

import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';
import { GoogleGenAI } from '@google/genai';

// Setup Express
const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Global vars
let History = [];
let pineconeIndex;

// Upload PDF & Index into Pinecone
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const PDF_PATH = req.file.path;
    const pdfLoader = new PDFLoader(PDF_PATH);
    const rawDocs = await pdfLoader.load();
    console.log("PDF loaded");

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });
    const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
    console.log("Chunking completed");

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'text-embedding-004',
    });

    const pinecone = new Pinecone();
    pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    console.log("Pinecone index configured");

    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
      pineconeIndex,
      maxConcurrency: 5,
    });

    console.log("Data stored successfully");
    History = []; // reset chat history
    res.json({ message: 'PDF uploaded & indexed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error processing PDF' });
  }
});

// Ask Question
app.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required' });

    if (!pineconeIndex) return res.status(400).json({ error: 'No PDF indexed yet' });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Step 1: Rewrite question using history
    History.push({ role: 'user', parts: [{ text: question }] });
    const rewriteRes = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: History,
      config: {
        systemInstruction: `You are a query rewriting expert. Rewrite the latest user question into a full, standalone question.`
      }
    });
    History.pop();
    const rewrittenQ = rewriteRes.text || question;

    // Step 2: Embed query
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'text-embedding-004'
    });
    const queryVector = await embeddings.embedQuery(rewrittenQ);

    // Step 3: Search in Pinecone
    const searchResults = await pineconeIndex.query({
      topK: 10,
      vector: queryVector,
      includeMetadata: true
    });

    const context = searchResults.matches.map(m => m.metadata.text).join('\n\n---\n\n');

    // Step 4: Get answer
    History.push({ role: 'user', parts: [{ text: rewrittenQ }] });
    const ansRes = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: History,
      config: {
        systemInstruction: `You are a Data Structure & Algorithm Expert. Use ONLY the context below to answer.
        If answer not found, say "I could not find the answer in the provided document."
        
        Context: ${context}`
      }
    });

    History.push({ role: 'model', parts: [{ text: ansRes.text }] });
    res.json({ answer: ansRes.text });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error answering question' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
