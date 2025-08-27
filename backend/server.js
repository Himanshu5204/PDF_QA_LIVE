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
    console.log('PDF loaded');

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });
    const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
    console.log('Chunking completed');

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GEMINI_API_KEY,
      model: 'text-embedding-004'
      //model: 'textembedding-gecko'
    });

    const testVec = await embeddings.embedQuery('hello world');
    console.log('Embedding dimension:', testVec.length);

    const pinecone = new Pinecone();
    pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    console.log('Pinecone index configured');

    // const vector = pinecone.data[0].embedding;

    // if (!vector || vector.length === 0) {
    //   console.error('❌ Empty embedding for chunk:', chunk);
    // } else if (vector.length !== 768) {
    //   console.error(`❌ Dimension mismatch: got ${vector.length}, expected 768`);
    // }

    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
      pineconeIndex,
      maxConcurrency: 5
    });

    console.log('Data stored successfully');
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

    const context = searchResults.matches.map((m) => m.metadata.text).join('\n\n---\n\n');

    // Step 4: Get answer final answer
    History.push({ role: 'user', parts: [{ text: rewrittenQ }] });
    const ansRes = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: History,
      config: {
        systemInstruction: `You are an expert tutor. 
        - Use ONLY the following extracted PDF context to answer.
        - If the user gave a short keyword (like "Array" or "Binary Search Tree"), still provide a complete explanation if context is partially relevant.
        - If nothing relevant is found at all, say: "I could not find the answer in the provided document."
        - Always answer in a friendly, engaging, and enthusiastic tone.
        - If only keywords match then also provide information about that topics not everytime try to excat matching. 
        - Give Some Examples by your own if answer is related to programming or technical topic or if possible.
        - Use Some Specifc Format to represent information so use can easily read or understand.

        ### Response Guidelines:      
          - Use headings, bullet points, and lists.  
          - Use code blocks for examples.  
          - Use tables for comparisons when helpful.  
          - Keep answers **clear, well-structured, and easy to read**.  
          - If no relevant information is found at all, say:  
            "I could not find the answer in the provided document."

        Remember: prioritize **structured formatting** (headings, line breaks, tables, lists, code) over plain paragraphs.

        Context:
        ${context}`
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
