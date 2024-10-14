// testImageGeneration.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

(async () => {
  try {
    const prompt = 'A full-width header with a background image of a beautiful sunset over mountains, with a semi-transparent black overlay';
    const response = await openai.createImage({
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    const imageUrl = response.data.data[0].url;
    const imagePath = path.join(__dirname, 'public', 'header.jpg');

    const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(imagePath);
    imageResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('Image generated and saved successfully.');
  } catch (error) {
    console.error('Error generating image:', error.response ? error.response.data : error.message);
  }
})();
