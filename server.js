const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const { OpenAI } = require('openai');
require('dotenv').config();
const session = require('express-session');

const app = express();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory session storage (you can replace this with a more permanent solution later)
app.use(session({
  secret: 'your-session-secret', // Change this to a strong secret
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true for HTTPS (production)
}));

// Load CSV data
function loadCSV() {
  return new Promise((resolve, reject) => {
    const data = [];
    fs.createReadStream('shopify_data.csv') // Ensure CSV is in the same folder
      .pipe(csv())
      .on('data', (row) => data.push(row))
      .on('end', () => resolve(data))
      .on('error', (err) => reject(err));
  });
}

// Function to get a response from OpenAI based on the store's data and memory
async function getAnswer(query, data, sessionHistory) {
  const prompt = `
  You are a helpful assistant answering questions about a Shopify store. Below is the store data and the context of previous conversations:

  Previous interactions:
  ${sessionHistory}

  Current data: ${JSON.stringify(data)}

  Question: ${query}

  Notes for answers: 
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
    const data = await loadCSV();
    const answer = await getAnswer(query, data, sessionHistory);

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
