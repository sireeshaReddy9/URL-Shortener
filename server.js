require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const dns = require('dns');
const mongoose = require('mongoose');
const cors = require('cors');
const { URL } = require('url');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/urlshortener';

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log(" Connected to MongoDB Atlas"))
  .catch(err => console.error(" MongoDB connection error:", err));

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

const urlSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  short_url: { type: Number, required: true, unique: true }
});
const Url = mongoose.model('Url', urlSchema);

async function getNextSequence(name) {
  const ret = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return ret.seq;
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/api/debug', (req, res) => {
  res.json({ mongoUri });
});

app.post('/api/shorturl', async (req, res) => {
  const input = (req.body.url || req.body.input || '').toString().trim();

  let hostname;
  try {
    const parsed = new URL(input);
    hostname = parsed.hostname;
  } catch (err) {
    return res.json({ error: 'invalid url' });
  }

  dns.lookup(hostname, async (dnsErr) => {
    if (dnsErr) {
      return res.json({ error: 'invalid url' });
    }

    try {
      const found = await Url.findOne({ original_url: input }).exec();
      if (found) {
        return res.json({ original_url: found.original_url, short_url: found.short_url });
      }

      const next = await getNextSequence('url_count');
      const newUrl = new Url({ original_url: input, short_url: next });
      await newUrl.save();

      return res.json({ original_url: newUrl.original_url, short_url: newUrl.short_url });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'server error' });
    }
  });
});

app.get('/api/shorturl/:short', async (req, res) => {
  const short = parseInt(req.params.short, 10);
  if (Number.isNaN(short)) {
    return res.json({ error: 'Wrong format' });
  }
  try {
    const found = await Url.findOne({ short_url: short }).exec();
    if (!found) return res.status(404).json({ error: 'No short URL found for given input' });
    return res.redirect(found.original_url);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(` Server listening on port ${port}`);
});
