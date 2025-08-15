//Phase 2: Query Resolving phase
import 'dotenv/config';
import readlineSync from 'readline-sync';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Pinecone } from '@pinecone-database/pinecone';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); //{apikey:""} new changes {}
const History = [];

async function chatting(userProblem) {

   const queries = await transformQuery(userProblem); //find que meaning first

  //converts this question into vector embedding
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'text-embedding-004'
  });
  //query vector / questionVector
  const queryVector = await embeddings.embedQuery(queries);
  //console.log('Question converted to vector');

  //Database connected - pinecone
  const pinecone = new Pinecone();
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  const searchResults = await pineconeIndex.query({
    topK: 10, //10 result fetch
    vector: queryVector,
    includeMetadata: true
  });
  //console.log('Search results fetched from Pinecone', searchResults);

  // top 10 documents : 10 metadata text needed that is part of 10 documents

  // create the context for llm
  const context = searchResults.matches
    .map((match) => match.metadata.text) //take only text
    .join('\n\n---\n\n');
  //console.log('Context created for LLM:', context);

  //Gemini model
  History.push({
    role: 'user',
    parts: [{ text: queries }]
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: History,
    config: {
      systemInstruction: `You have to behave like a Data Structure and Algorithm Expert.
    You will be given a context of relevant information and a user question.
    Your task is to answer the user's question based ONLY on the provided context.
    If the answer is not in the context, you must say "I could not find the answer in the provided document."
    Keep your answers clear, concise, and educational.
      
      Context: ${context}
      `
    }
  });

  History.push({
    role: 'model',
    parts: [{ text: response.text }]
  });

  //console.log('\n');
  console.log(response.text);
}

//2nd llm to make context meaning full like (1st que + ans + 2nd que)
async function transformQuery(question) {
  History.push({
    role: 'user',
    parts: [{ text: question }]
  });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: History,
    config: {
      systemInstruction: `You are a query rewriting expert. Based on the provided chat history, rephrase the "Follow Up user Question"
       into a complete, standalone question that can be understood without the chat history.
    Only output the rewritten question and nothing else.
      `
    }
  });

  History.pop();

  return response.text;
}

async function main() {
  const userProblem = readlineSync.question('Ask me anything--> ');
  await chatting(userProblem);
  main();
}

main();

//it assume as two different questions but actually related no history check ,

//what is quick sort -->context:vector db answer
//explain it in detail --> context:vector db answer

// so solution 2nd llm previous que + model answer + new que
// reply what is quick sort in depth. (relavant query together,meaning ful together)
// next time we give this proper context
