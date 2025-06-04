const readline = require('readline');

const askToContinue = async (message = 'Press Enter to return to main menu...') => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
};

const askQuestion = async (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

module.exports = {
  askToContinue,
  askQuestion
};