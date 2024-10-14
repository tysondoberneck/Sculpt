// sculpt/cssGenerator.js
const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports = {
  generateCSS: async function (prompt, selector) {
    try {
      console.log(`Sending prompt to OpenAI API: "${prompt}" with selector "${selector}"`);
      const messages = [
        {
          role: 'system',
          content: 'You are an assistant that generates CSS code based on descriptions.',
        },
        {
          role: 'user',
          content: `Generate CSS code for the following description:

Description:
"${prompt}"

Use the selector "${selector}" in the CSS code.

Requirements:
- Include all necessary CSS properties as per the description.
- Do NOT include placeholder comments like '/* styled inputs */' or '/* Copy styles from above */'.
- Do NOT assume styles from previous selectors.
- The CSS code should be self-contained and fully define the styles for "${selector}".
- Do NOT include any comments, explanations, or code fences.
- Output ONLY the CSS code.

Example Output:

${selector} {
  /* CSS properties */
}
`,
        },
      ];

      const response = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 300,
        temperature: 0.7,
      });

      let cssCode = response.data.choices[0].message.content.trim();
      console.log(`Raw CSS code received from OpenAI API:\n${cssCode}`);

      // Remove any code fences or extra content
      cssCode = cssCode.replace(/```css([\s\S]*?)```/g, '$1').trim();
      cssCode = cssCode.replace(/```([\s\S]*?)```/g, '$1').trim();

      // Ensure the CSS code starts with the correct selector
      if (!cssCode.startsWith(selector)) {
        cssCode = `${selector} {\n${cssCode}\n}`;
      }

      // Ensure all braces are properly closed
      const openBraces = (cssCode.match(/{/g) || []).length;
      const closeBraces = (cssCode.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        cssCode += '\n}';
      }

      // Remove any extra content after the final closing brace
      const lastClosingBraceIndex = cssCode.lastIndexOf('}');
      cssCode = cssCode.substring(0, lastClosingBraceIndex + 1);

      // **Check for Empty Rulesets**
      const cssContentMatch = cssCode.match(/\{\s*([^]*?)\s*\}/);
      const cssContent = cssContentMatch ? cssContentMatch[1].trim() : '';
      if (!cssContent || cssContent.includes('/*') || cssContent.includes('*/')) {
        console.warn(`Warning: Empty or invalid CSS ruleset generated for selector "${selector}".`);
        return '';
      }

      return cssCode;
    } catch (error) {
      console.error('Error generating CSS:', error.message);
      return '';
    }
  },
};
