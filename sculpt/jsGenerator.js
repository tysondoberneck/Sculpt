// sculpt/jsGenerator.js
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports = {
  generateJS: async function (prompt, elementId) {
    try {
      console.log(`Generating JavaScript for element "${elementId}" with prompt: "${prompt}"`);

      const messages = [
        {
          role: 'system',
          content: 'You are an assistant that generates JavaScript code based on descriptions.',
        },
        {
          role: 'user',
          content: `Generate JavaScript code for the following description:

Description:
"${prompt}"

The JavaScript code should interact with the HTML element with id "${elementId}".

Requirements:
- The code should be valid and executable in a browser.
- Do NOT include code fences, comments, or any explanations.
- Output ONLY the JavaScript code.

Example Output:

document.getElementById('${elementId}').addEventListener('click', function() {
  // Your code here
});
`,
        },
      ];

      const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 200,
        temperature: 0.7,
      });

      let jsCode = response.data.choices[0].message.content.trim();
      console.log(`Raw JavaScript code received from OpenAI API:\n${jsCode}`);

      // Remove any code fences
      jsCode = jsCode.replace(/```javascript([\s\S]*?)```/g, '$1').trim();
      jsCode = jsCode.replace(/```js([\s\S]*?)```/g, '$1').trim();
      jsCode = jsCode.replace(/```([\s\S]*?)```/g, '$1').trim();

      return jsCode;
    } catch (error) {
      console.error('Error generating JavaScript:', error.message);
      return '';
    }
  },
};
