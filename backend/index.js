//RAG Retrieval-Augmented Generation data retrieval from llm who generates where
// we augment the input with relevant context

//Pdf load

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeStore } from '@langchain/pinecone';

async function indexDocument() {
  const PDF_PATH = './PDFs/dsa.pdf';
  const pdfLoader = new PDFLoader(PDF_PATH);
  const rawDocs = await pdfLoader.load();
  //console.log(rawDocs.length,"pages"); //112 pages
  console.log("PDF loaded");

  //chunking - divided into small parts also do by loops
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000, //1-1000 , 800-1800 , 1600-2600 for content not lost
    chunkOverlap: 200
  });
  const chunkedDocs = await textSplitter.splitDocuments(rawDocs);
  //console.log(chunkedDocs.length,"chunks"); //227 chunks
  console.log("chunking completed");


  //data converts into Vector - Embedding model
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004',
  });
  console.log("Embedding model configured");


  //Database configure connectivity - Pinecone for data store
  const pinecone = new Pinecone();
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  console.log("Pinecone index configured");

  //langchain (chunking,embedding,database)
  await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
    pineconeIndex,
    maxConcurrency: 5, //5-5 store together 
  });
  console.log("Data stored successfully");

}


indexDocument();