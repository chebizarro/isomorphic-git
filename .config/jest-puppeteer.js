export default {
  launch: {
    browser: process.env.JEST_BROWSER,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
	 headless: true,
  },
}
