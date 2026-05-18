const { Client } = require('pg');
const connectionString = process.argv[2];

if (!connectionString) {
  console.error('Please provide a connection string as an argument.');
  process.exit(1);
}

const client = new Client({
  connectionString: connectionString,
});

console.log('Attempting to connect...');
client.connect()
  .then(() => {
    console.log('Successfully connected to the database!');
    return client.query('SELECT current_database(), current_user');
  })
  .then(res => {
    console.log('Database Info:', res.rows[0]);
    return client.end();
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });
