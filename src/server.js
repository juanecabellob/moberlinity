let express = require('express'),
    urlCleaner = require('express-url-cleaner'),
    app = express(),
    http = require('http'),
    cors = require('cors'),
    path = require('path');

app.use(urlCleaner());
app.use(cors());
app.use(express.static(path.join(__dirname, 'static')));

// Define the port to run on
app.set('port', 3000);
// Listen for requests
let server = app.listen(app.get('port'), function() {
  let port = server.address().port;
  console.log('Magic happens on port ' + port);
});