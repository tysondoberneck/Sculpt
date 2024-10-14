// app.js
require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const md5 = require('md5');
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');

const cssGenerator = require('./sculpt/cssGenerator');
const jsGenerator = require('./sculpt/jsGenerator'); // Include if you have JS generation

const app = express();
const port = 3000;

const GENERATED_CSS_START = '/* Sculpt Generated CSS Start */';
const GENERATED_CSS_END = '/* Sculpt Generated CSS End */';
const GENERATED_JS_START = '/* Sculpt Generated JS Start */';
const GENERATED_JS_END = '/* Sculpt Generated JS End */';

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Ensure the cache directory exists
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const cssCache = {};
const jsCache = {};

// Load cached CSS and JS
const loadCache = () => {
  console.log('Loading cached CSS and JS files...');
  const files = fs.readdirSync(cacheDir);
  files.forEach((file) => {
    if (file.endsWith('.css')) {
      const cacheKey = path.basename(file, '.css');
      const cssContent = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
      cssCache[cacheKey] = cssContent;
    } else if (file.endsWith('.js')) {
      const cacheKey = path.basename(file, '.js');
      const jsContent = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
      jsCache[cacheKey] = jsContent;
    }
  });
  console.log(`Loaded ${Object.keys(cssCache).length} cached CSS files.`);
  console.log(`Loaded ${Object.keys(jsCache).length} cached JS files.`);
};

loadCache();

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  next();
});

// Route to handle HTML files
app.get(['/', '/*.html'], async (req, res) => {
  let requestedPath = req.path;

  if (requestedPath === '/') {
    requestedPath = '/index.html';
  }

  const filePath = path.join(__dirname, 'public', requestedPath);

  try {
    let htmlContent = fs.readFileSync(filePath, 'utf-8');

    // Process the HTML content
    const $ = cheerio.load(htmlContent);

    let generatedCSS = [];
    let generatedJS = [];

    const elements = $('[ai_prompt], [ai_js_prompt]');
    console.log(`Found ${elements.length} elements with ai_prompt or ai_js_prompt.`);

    for (let i = 0; i < elements.length; i++) {
      const element = elements.eq(i);
      const aiPrompt = element.attr('ai_prompt');
      const aiJsPrompt = element.attr('ai_js_prompt');
      const regenerateAttr = element.attr('regenerate');
      const regenerate = regenerateAttr && regenerateAttr.toLowerCase() === 'true';
      let selector = '';

      if (element.attr('id')) {
        selector = `#${element.attr('id')}`;
      } else if (element.attr('class')) {
        selector = '.' + element.attr('class').split(' ').join('.');
      } else {
        console.log('Skipping element without id or class:', element.html());
        continue;
      }

      // **Image Generation Logic for <img> Elements**
      if (element.is('img')) {
        const src = element.attr('src');
        const imagePath = path.join(__dirname, 'public', src);

        if (!fs.existsSync(imagePath)) {
          console.log(`Image ${src} not found. Generating image...`);

          // Use the ai_prompt or default description
          const imageDescription = element.attr('ai_prompt') || 'default image';

          // Generate image using OpenAI's API
          try {
            const response = await openai.createImage({
              prompt: imageDescription,
              n: 1,
              size: '1024x1024',
            });

            const imageUrl = response.data.data[0].url;

            // Download the image
            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
            const writer = fs.createWriteStream(imagePath);
            imageResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
              writer.on('finish', resolve);
              writer.on('error', reject);
            });

            console.log(`Image ${src} generated and saved.`);
          } catch (imageError) {
            console.error(`Error generating image ${src}:`, imageError.response ? imageError.response.data : imageError.message);
          }
        } else {
          console.log(`Image ${src} already exists. Skipping generation.`);
        }
      }

      // **Process CSS Generation**
      if (aiPrompt) {
        const cacheKey = md5(`css:${selector}:${aiPrompt}`);
        let cssCode;

        if (!regenerate && cssCache[cacheKey]) {
          cssCode = cssCache[cacheKey];
          console.log(`Using cached CSS for ${selector}`);
        } else {
          cssCode = await cssGenerator.generateCSS(aiPrompt, selector);
          if (cssCode) {
            // **Check for Empty Rulesets**
            const cssContentMatch = cssCode.match(/\{\s*([^]*?)\s*\}/);
            const cssContent = cssContentMatch ? cssContentMatch[1].trim() : '';
            if (cssContent && !cssContent.includes('/*') && !cssContent.includes('*/')) {
              cssCache[cacheKey] = cssCode;
              fs.writeFileSync(path.join(cacheDir, `${cacheKey}.css`), cssCode);
              console.log(`CSS for ${selector} cached.`);
            } else {
              console.warn(`Empty or invalid CSS ruleset detected for ${selector}. Skipping caching.`);
              cssCode = ''; // Discard invalid CSS
            }
          } else {
            console.log(`No CSS generated for ${selector}`);
          }
        }

        if (cssCode) {
          const cssBlock = `/* Generated using Sculpt */\n${cssCode}`;
          generatedCSS.push(cssBlock);
        }
      }

      // **Process JavaScript Generation**
      if (aiJsPrompt) {
        const jsCacheKey = md5(`js:${selector}:${aiJsPrompt}`);
        let jsCode;

        if (!regenerate && jsCache[jsCacheKey]) {
          jsCode = jsCache[jsCacheKey];
          console.log(`Using cached JavaScript for ${selector}`);
        } else {
          jsCode = await jsGenerator.generateJS(aiJsPrompt, element.attr('id'));
          if (jsCode) {
            jsCache[jsCacheKey] = jsCode;
            fs.writeFileSync(path.join(cacheDir, `${jsCacheKey}.js`), jsCode);
            console.log(`JavaScript for ${selector} cached.`);
          } else {
            console.log(`No JavaScript generated for ${selector}`);
          }
        }

        if (jsCode) {
          generatedJS.push(`// Generated using Sculpt\n${jsCode}`);
        }
      }

      // Remove ai_prompt, ai_js_prompt, and regenerate attributes
      element.removeAttr('ai_prompt');
      element.removeAttr('ai_js_prompt');
      element.removeAttr('regenerate');
    }

    // Write generated CSS
    const cssFilePath = path.join(__dirname, 'public', 'styles.css');
    let existingCSS = '';
    if (fs.existsSync(cssFilePath)) {
      existingCSS = fs.readFileSync(cssFilePath, 'utf-8');
    }

    const generatedCSSRegex = new RegExp(`${GENERATED_CSS_START}[\\s\\S]*?${GENERATED_CSS_END}`, 'g');
    existingCSS = existingCSS.replace(generatedCSSRegex, '').trim();

    const combinedCSS = `${existingCSS}\n\n${GENERATED_CSS_START}\n${generatedCSS.join('\n\n')}\n${GENERATED_CSS_END}`;

    fs.writeFileSync(cssFilePath, combinedCSS.trim());
    console.log(`Generated CSS written to ${cssFilePath}`);

    // Write generated JS
    const jsFilePath = path.join(__dirname, 'public', 'script.js');
    let existingJS = '';
    if (fs.existsSync(jsFilePath)) {
      existingJS = fs.readFileSync(jsFilePath, 'utf-8');
    }

    const generatedJSRegex = new RegExp(`${GENERATED_JS_START}[\\s\\S]*?${GENERATED_JS_END}`, 'g');
    existingJS = existingJS.replace(generatedJSRegex, '').trim();

    const combinedJS = `${existingJS}\n\n${GENERATED_JS_START}\n${generatedJS.join('\n\n')}\n${GENERATED_JS_END}`;

    fs.writeFileSync(jsFilePath, combinedJS.trim());
    console.log(`Generated JavaScript written to ${jsFilePath}`);

    // Ensure the HTML file links to styles.css and script.js
    let hasLink = false;
    $('head link[rel="stylesheet"]').each((i, el) => {
      if ($(el).attr('href') === 'styles.css') {
        hasLink = true;
      }
    });
    if (!hasLink) {
      $('head').append('<link rel="stylesheet" href="styles.css">');
      console.log('Link to styles.css added to HTML.');
    }

    let hasScript = false;
    $('script[src]').each((i, el) => {
      if ($(el).attr('src') === 'script.js') {
        hasScript = true;
      }
    });
    if (!hasScript) {
      $('body').append('<script src="script.js"></script>');
      console.log('script.js added to HTML.');
    }

    // Send the modified HTML content
    res.send($.html());
  } catch (error) {
    console.error('Error processing HTML file:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
