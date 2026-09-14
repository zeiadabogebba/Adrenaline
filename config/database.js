const mongoose = require('mongoose');

async function connectDatabase() {
  await mongoose.connect(process.env.MONGO_URL);
}

module.exports = connectDatabase;
