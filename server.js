const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const { OpenAI } = require('openai');
require('dotenv').config();
const session = require('express-session');
const cors = require('cors'); // Import the cors package


const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Enable CORS for all routes and all origins
app.use(cors()); // This will allow CORS for all origins by default

// In-memory session storage
app.use(session({
  secret: 'your-session-secret', // Change this to a strong secret
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true for HTTPS (production)
}));

// Load product data CSV
function loadCSVProduct() {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream('shopify_store_data.csv') // Ensure CSV is in the same folder
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', (err) => reject(err));
  });
}

// Load general store info CSV
function loadCSVGeneral() {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream('shopify_store_general_info.csv') // Ensure CSV is in the same folder
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', (err) => reject(err));
  });
}

// Function to get a response from OpenAI based on store's data and memory
async function getAnswer(query, productData, generalData, sessionHistory) {
  const prompt = `
  You are a helpful assistant answering questions about a Shopify store. Below is the store data and the context of previous conversations:

  Previous interactions:
  ${sessionHistory}

  Product data: ${JSON.stringify(productData)}
  General store info: ${JSON.stringify(generalData)}

  Question: ${query}

    Notes for answers: 
        1. You are a chatbot ai assistant, your name is SaleMate, and you want to help with every thing related to Customer service for the store.
        1. if you can, keep the answers short.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error with OpenAI API:', error);
    return 'Sorry, I couldn’t process your request.';
  }
}

// API endpoint to handle chat requests and remember context
app.get('/ask', async (req, res) => {
  const query = req.query.query;
  const sessionId = req.sessionID;

  if (!query) {
    return res.status(400).send('Please provide a query.');
  }

  // Initialize session memory if it doesn't exist
  if (!req.session.chatHistory) {
    req.session.chatHistory = [];
  }

  // Get the stored chat history for this session
  const sessionHistory = req.session.chatHistory.join("\n");

  try {
    const productData = await loadCSVProduct();
    const generalData = await loadCSVGeneral();
    const answer = await getAnswer(query, productData, generalData, sessionHistory);

    // Store the question and answer in the session history for future context
    req.session.chatHistory.push(`Q: ${query}\nA: ${answer}`);

    // Return the answer to the user
    res.json({ answer });

  } catch (error) {
    res.status(500).send('Error processing the request.');
  }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
