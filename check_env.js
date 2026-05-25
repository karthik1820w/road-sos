import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function test() {
  const file = fs.readFileSync('.env.example', 'utf8');
  console.log(file);
}
test();
